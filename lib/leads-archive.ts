import { sql } from "./db";

// Archiviazione dei lead: un lead archiviato resta nel database ma l'app non lo riceve più.
// Serve per togliere dal CRM i lead di prova (o doppi) senza cancellare nulla: si può ripristinare.

export class ValidationError extends Error {}

const MAX_IDS = 200;

// La colonna viene aggiunta al primo utilizzo: non serve un passaggio manuale sul database.
let columnReady: Promise<void> | null = null;

export function ensureArchiveColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = (async () => {
      await sql`alter table leads add column if not exists archived_at timestamptz`;
    })().catch((error) => {
      // Un errore non deve restare memorizzato: la prossima richiesta riprova.
      columnReady = null;
      throw error;
    });
  }
  return columnReady;
}

/** Controlla la richiesta: elenco di identificativi e se archiviare o ripristinare. */
export function parseArchiveRequest(body: unknown): { ids: string[]; archived: boolean } {
  const { ids, archived } = (body ?? {}) as { ids?: unknown; archived?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError("Manca l'elenco dei lead.");
  if (ids.length > MAX_IDS) throw new ValidationError(`Al massimo ${MAX_IDS} lead per richiesta.`);
  const clean = ids.map((id) => {
    if ((typeof id !== "string" && typeof id !== "number") || !/^[A-Za-z0-9-]{1,64}$/.test(String(id))) {
      throw new ValidationError("Identificativo del lead non valido.");
    }
    return String(id);
  });
  if (archived !== undefined && typeof archived !== "boolean") throw new ValidationError("Valore di archived non valido.");
  return { ids: [...new Set(clean)], archived: archived !== false };
}

/** Archivia o ripristina i lead indicati. Restituisce quanti sono stati cambiati. */
export async function setArchived(ids: string[], archived: boolean): Promise<number> {
  await ensureArchiveColumn();
  const rows = await sql`
    update leads
    set archived_at = ${archived ? sql`now()` : null}
    where id::text = any(${ids})
    returning id
  `;
  return rows.length;
}
