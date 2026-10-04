import { sql } from "./db";

// File dei documenti dei clienti (foto e PDF allegati alla checklist nel CRM), per averli sia
// sul telefono sia sul computer. Un file per documento: l'identificativo è quello del documento.
// Il contenuto sta nel database, in una tabella non raggiungibile dalle API pubbliche.
// Limite: 3 MB per file, perché una richiesta alla funzione non può superare circa 4,5 MB.

export class ValidationError extends Error {}

export const MAX_FILE_BYTES = 3_000_000;
const TYPES = ["image/jpeg", "image/png", "image/heic", "application/pdf"];

export type FileInput = { contactId: string; filename: string; contentType: string; content: Buffer };

// La tabella viene creata al primo utilizzo: non serve un passaggio manuale sul database.
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists crm_files (
          id text primary key,
          contact_id text not null,
          filename text not null,
          content_type text not null,
          size integer not null,
          content bytea not null,
          updated_at timestamptz not null default now()
        )
      `;
      // Con la sicurezza a livello di riga attiva e nessuna regola, la tabella non è
      // leggibile dalle API pubbliche del database: ci arriva solo questo backend.
      await sql`alter table crm_files enable row level security`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Identificativo del file: lettere, cifre e trattini (è l'UUID del documento). */
export function parseId(value: unknown): string {
  const id = Array.isArray(value) ? value[0] : value;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new ValidationError("Identificativo non valido.");
  return id;
}

/** Controlla il file inviato da un dispositivo. Il contenuto arriva in base64. */
export function parseFile(body: unknown): FileInput {
  const { contactId, filename, contentType, data } = (body ?? {}) as Record<string, unknown>;
  if (typeof contactId !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(contactId)) {
    throw new ValidationError("Contatto non valido.");
  }
  // Solo il nome, senza percorsi
  if (typeof filename !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(filename) || filename.includes("..")) {
    throw new ValidationError("Nome del file non valido.");
  }
  if (typeof contentType !== "string" || !TYPES.includes(contentType)) {
    throw new ValidationError("Tipo di file non ammesso.");
  }
  if (typeof data !== "string" || data.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new ValidationError("Contenuto del file non valido.");
  }
  const content = Buffer.from(data, "base64");
  if (content.length === 0) throw new ValidationError("Il file è vuoto.");
  if (content.length > MAX_FILE_BYTES) throw new ValidationError("File troppo grande (massimo 3 MB).");
  return { contactId, filename, contentType, content };
}

export async function saveFile(id: string, file: FileInput) {
  await ensureSchema();
  await sql`
    insert into crm_files (id, contact_id, filename, content_type, size, content)
    values (${id}, ${file.contactId}, ${file.filename}, ${file.contentType}, ${file.content.length}, ${file.content})
    on conflict (id) do update
      set contact_id = excluded.contact_id,
          filename = excluded.filename,
          content_type = excluded.content_type,
          size = excluded.size,
          content = excluded.content,
          updated_at = now()
  `;
  return { id, size: file.content.length };
}

export async function readFile(id: string) {
  await ensureSchema();
  const [row] = await sql`select contact_id, filename, content_type, size, content from crm_files where id = ${id}`;
  if (!row) return null;
  return {
    id,
    contactId: row.contact_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    data: Buffer.from(row.content).toString("base64"),
  };
}

/** Toglie il file: l'allegato è stato rimosso nel CRM (o la persona ha chiesto la cancellazione). */
export async function deleteFile(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql`delete from crm_files where id = ${id} returning id`;
  return rows.length > 0;
}
