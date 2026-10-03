import { sql } from "./db";

// Incarico: un proprietario affida un immobile da vendere o da affittare.
// Formato piatto, identico a quello usato dall'app e dal tool sul Mac.

const TYPES = ["sale", "rent"];
const STATUSES = ["negotiating", "active", "closed", "withdrawn"];

export class ValidationError extends Error {}

// La tabella viene creata al primo utilizzo: non serve un passaggio manuale sul database.
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists mandates (
          id uuid primary key default gen_random_uuid(),
          owner_name text not null,
          phone text,
          email text,
          tax_code text,
          type text not null,
          status text not null,
          address text,
          province text,
          city text,
          cadastral_sheet text,
          cadastral_parcel text,
          cadastral_sub text,
          cadastral_type text,
          price integer,
          start_date text,
          end_date text,
          notes text,
          latitude double precision,
          longitude double precision,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          deleted_at timestamptz
        )
      `;
      // Con la sicurezza a livello di riga attiva e nessuna regola, la tabella non è
      // leggibile dalle API pubbliche del database: ci arriva solo questo backend.
      await sql`alter table mandates enable row level security`;
    })().catch((error) => {
      // Un errore non deve restare memorizzato: la prossima richiesta riprova.
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

// Testo facoltativo ripulito e limitato; vuoto diventa null.
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim();
  if (cleaned.length > max) {
    throw new ValidationError("Un campo supera la lunghezza consentita.");
  }
  return cleaned.length > 0 ? cleaned : null;
}

// Data senza orario, AAAA-MM-GG.
function day(value: unknown): string | null {
  const cleaned = text(value, 10);
  if (cleaned === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    throw new ValidationError("Le date vanno indicate come AAAA-MM-GG.");
  }
  // Il formato non basta: 2026-02-31 va rifiutato. La data ricostruita deve coincidere.
  const parsed = new Date(`${cleaned}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== cleaned) {
    throw new ValidationError("La data indicata non esiste.");
  }
  return cleaned;
}

// Numero facoltativo entro un intervallo.
function number(value: unknown, min: number, max: number, integer = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError("Un valore numerico non è valido.");
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError("Il prezzo deve essere un numero intero.");
  }
  return value;
}

/** Controlla e normalizza i dati ricevuti. Solleva ValidationError con un messaggio leggibile. */
export function parseMandate(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Corpo della richiesta non valido.");
  }
  const b = body as Record<string, unknown>;

  const ownerName = text(b.ownerName, 200);
  if (!ownerName || ownerName.length < 2) {
    throw new ValidationError("Il nome del proprietario è obbligatorio.");
  }
  if (typeof b.type !== "string" || !TYPES.includes(b.type)) {
    throw new ValidationError("Il tipo deve essere sale oppure rent.");
  }
  const status = b.status === undefined || b.status === null ? "negotiating" : b.status;
  if (typeof status !== "string" || !STATUSES.includes(status)) {
    throw new ValidationError("Stato dell'incarico non valido.");
  }

  // Telefono con sole cifre e "+", email in minuscolo: così lo stesso contatto è riconoscibile.
  const phone = text(b.phone, 40)?.replace(/[^\d+]/g, "") || null;
  const email = text(b.email, 200)?.toLowerCase() ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("L'indirizzo email non è valido.");
  }

  const cadastralType = text(b.cadastralType, 1);
  if (cadastralType && !["F", "T"].includes(cadastralType)) {
    throw new ValidationError("Il catasto deve essere F oppure T.");
  }

  const latitude = number(b.latitude, -90, 90);
  const longitude = number(b.longitude, -180, 180);
  if ((latitude === null) !== (longitude === null)) {
    throw new ValidationError("Latitudine e longitudine vanno indicate insieme.");
  }

  const startDate = day(b.startDate);
  const endDate = day(b.endDate);
  if (startDate && endDate && endDate < startDate) {
    throw new ValidationError("La scadenza non può precedere l'inizio.");
  }

  return {
    owner_name: ownerName,
    phone,
    email,
    tax_code: text(b.taxCode, 16)?.toUpperCase() ?? null,
    type: b.type,
    status,
    address: text(b.address, 300),
    province: text(b.province, 80),
    city: text(b.city, 120),
    cadastral_sheet: text(b.cadastralSheet, 12),
    cadastral_parcel: text(b.cadastralParcel, 12),
    cadastral_sub: text(b.cadastralSub, 12),
    cadastral_type: cadastralType,
    price: number(b.price, 0, 2_000_000_000, true),
    start_date: startDate,
    end_date: endDate,
    notes: text(b.notes, 4000),
    latitude,
    longitude,
  };
}

/** Riga del database nel formato scambiato con app e tool. */
export function toFlat(row) {
  return {
    id: row.id,
    ownerName: row.owner_name,
    phone: row.phone,
    email: row.email,
    taxCode: row.tax_code,
    type: row.type,
    status: row.status,
    address: row.address,
    province: row.province,
    city: row.city,
    cadastralSheet: row.cadastral_sheet,
    cadastralParcel: row.cadastral_parcel,
    cadastralSub: row.cadastral_sub,
    cadastralType: row.cadastral_type,
    price: row.price,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    latitude: row.latitude,
    longitude: row.longitude,
    // Usato dai client come versione: cambia a ogni modifica.
    updatedAt: new Date(row.updated_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

// Identificativo nel formato atteso dal database; altro non viene nemmeno cercato.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Tutti gli incarichi, compresi quelli cancellati (servono alla sincronizzazione). */
export async function listMandates() {
  await ensureSchema();
  // Nessun limite: un elenco troncato farebbe perdere incarichi e cancellazioni ai dispositivi.
  const rows = await sql`select * from mandates order by updated_at desc`;
  return rows.map(toFlat);
}

export async function createMandate(data: ReturnType<typeof parseMandate>) {
  await ensureSchema();
  const rows = await sql`insert into mandates ${sql(data)} returning *`;
  return toFlat(rows[0]);
}

/** Restituisce null se l'incarico non esiste o è stato cancellato. */
export async function updateMandate(id: string, data: ReturnType<typeof parseMandate>) {
  await ensureSchema();
  const rows = await sql`
    update mandates set ${sql(data)}, updated_at = now()
    where id = ${id} and deleted_at is null
    returning *
  `;
  return rows.length > 0 ? toFlat(rows[0]) : null;
}

/** Cancellazione logica: resta visibile come cancellato agli altri dispositivi. */
export async function deleteMandate(id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await sql`
    update mandates
    set deleted_at = coalesce(deleted_at, now()), updated_at = now()
    where id = ${id}
    returning id
  `;
  return rows.length > 0;
}
