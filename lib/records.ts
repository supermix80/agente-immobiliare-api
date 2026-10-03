import { sql } from "./db";

// Sincronizzazione del CRM tra i dispositivi (iPhone e Mac).
// Ogni dato dell'app (contatto, compito, attività, scheda immobile, telefonata…) è una "scheda":
// raccolta + identificativo + contenuto JSON. Il server non interpreta il contenuto: lo conserva
// e dice a ogni dispositivo cosa è cambiato dall'ultima volta.
// Ordine dei cambiamenti: un numero progressivo (seq), non l'orologio dei dispositivi.

export class ValidationError extends Error {}

// Raccolte ammesse: un nome sconosciuto è un errore del client, non un dato da salvare.
export const COLLECTIONS = [
  "contacts",
  "tasks",
  "activities",
  "properties",
  "callLogs",
  "visitFeedbacks",
  "purchaseProposals",
  "waTemplates",
  "taskMeta",
  "contactDocuments",
  "assistantThreads",
  "agentProfile",
  "externalListings",
];

const MAX_RECORDS = 200;
const MAX_PAYLOAD_BYTES = 200_000;
const MAX_ID_LENGTH = 80;

export type RecordInput = { collection: string; id: string; payload: unknown; deleted: boolean };

// La tabella viene creata al primo utilizzo: non serve un passaggio manuale sul database.
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`create sequence if not exists crm_records_seq`;
      await sql`
        create table if not exists crm_records (
          collection text not null,
          id text not null,
          payload jsonb,
          deleted boolean not null default false,
          seq bigint not null default nextval('crm_records_seq'),
          updated_at timestamptz not null default now(),
          primary key (collection, id)
        )
      `;
      await sql`create index if not exists crm_records_seq_idx on crm_records (seq)`;
      // Con la sicurezza a livello di riga attiva e nessuna regola, la tabella non è
      // leggibile dalle API pubbliche del database: ci arriva solo questo backend.
      await sql`alter table crm_records enable row level security`;
    })().catch((error) => {
      // Un errore non deve restare memorizzato: la prossima richiesta riprova.
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Punto da cui riprendere: numero intero non negativo; assente = dall'inizio. */
export function parseSince(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isSafeInteger(n) || n < 0) throw new ValidationError("Parametro since non valido.");
  return n;
}

/** Controlla le schede inviate da un dispositivo. */
export function parseRecords(body: unknown): RecordInput[] {
  const list = (body as { records?: unknown } | null)?.records;
  if (!Array.isArray(list)) throw new ValidationError("Manca l'elenco delle schede.");
  if (list.length === 0) throw new ValidationError("Nessuna scheda da salvare.");
  if (list.length > MAX_RECORDS) throw new ValidationError(`Al massimo ${MAX_RECORDS} schede per richiesta.`);

  const seen = new Set<string>();
  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ValidationError("Scheda non valida.");
    const { collection, id, payload, deleted } = item as Record<string, unknown>;
    if (typeof collection !== "string" || !COLLECTIONS.includes(collection)) {
      throw new ValidationError("Raccolta non riconosciuta.");
    }
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new ValidationError("Identificativo non valido.");
    }
    const key = `${collection}/${id}`;
    if (seen.has(key)) throw new ValidationError("La stessa scheda compare due volte.");
    seen.add(key);

    const isDeleted = deleted === true;
    if (isDeleted) return { collection, id, payload: null, deleted: true };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ValidationError("Il contenuto della scheda deve essere un oggetto.");
    }
    if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_PAYLOAD_BYTES) {
      throw new ValidationError("Scheda troppo grande.");
    }
    return { collection, id, payload, deleted: false };
  });
}

/** Schede cambiate dopo `since`, in ordine, e il punto da cui riprendere la prossima volta. */
export async function changesSince(since: number) {
  await ensureSchema();
  const rows = await sql`
    select collection, id, payload, deleted, seq
    from crm_records
    where seq > ${since}
    order by seq
    limit 2000
  `;
  const records = rows.map((r) => ({
    collection: r.collection,
    id: r.id,
    payload: r.deleted ? null : r.payload,
    deleted: r.deleted,
    seq: Number(r.seq),
  }));
  const cursor = records.length > 0 ? records[records.length - 1].seq : since;
  // Se il limite è stato raggiunto ci sono altre schede: il dispositivo richiede ancora da cursor.
  return { records, cursor, more: records.length === 2000 };
}

/** Salva o elimina le schede: vince l'ultima arrivata. Restituisce il numero progressivo di ognuna. */
export async function saveRecords(records: RecordInput[]) {
  await ensureSchema();
  const saved = await sql.begin(async (tx) => {
    const out: { collection: string; id: string; seq: number }[] = [];
    for (const record of records) {
      const payload = record.deleted ? null : tx.json(record.payload as never);
      const [row] = await tx`
        insert into crm_records (collection, id, payload, deleted)
        values (${record.collection}, ${record.id}, ${payload}, ${record.deleted})
        on conflict (collection, id) do update
          set payload = excluded.payload,
              deleted = excluded.deleted,
              seq = nextval('crm_records_seq'),
              updated_at = now()
        returning seq
      `;
      out.push({ collection: record.collection, id: record.id, seq: Number(row.seq) });
    }
    return out;
  });
  return { records: saved };
}
