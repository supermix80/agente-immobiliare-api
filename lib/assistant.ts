import { z } from "zod";

// Assistente digitale: prepara la BOZZA della prossima risposta a un lead.
// Non invia nulla: la bozza torna all'app, Annamaria la legge, la corregge e la manda lei.

export class ValidationError extends Error {}

/** Risposta dell'assistente, validata dal modello e di nuovo qui. */
export const DraftSchema = z.object({
  messaggio: z.string(),
  azione: z.enum(["continua", "fissa_sopralluogo", "fissa_telefonata", "passa_ad_anna", "chiudi"]),
  dati: z.object({
    motivo: z.string(),
    tempi: z.string(),
    occupazione: z.string(),
    decisori: z.string(),
    mutuo: z.string(),
    altre_agenzie: z.string(),
    appuntamento: z.string(),
  }),
});
export type Draft = z.infer<typeof DraftSchema>;

const MAX_MESSAGES = 40;
const MAX_TEXT = 2000;
const MAX_REQUEST = 3000;

export interface DraftRequest {
  request: string;
  messages: { from: "agente" | "cliente"; text: string }[];
}

/** Controlla il corpo della richiesta. Solleva ValidationError con un messaggio leggibile. */
export function parseDraftRequest(body: unknown): DraftRequest {
  if (!body || typeof body !== "object") throw new ValidationError("Corpo della richiesta non valido.");
  const b = body as Record<string, unknown>;
  const request = typeof b.request === "string" ? b.request.trim() : "";
  if (!request) throw new ValidationError("Manca la richiesta del lead.");
  if (request.length > MAX_REQUEST) throw new ValidationError("La richiesta è troppo lunga.");
  // Campo assente: primo messaggio. Presente ma non elenco: errore del client, da non nascondere.
  if (b.messages !== undefined && !Array.isArray(b.messages)) {
    throw new ValidationError("La conversazione deve essere un elenco di messaggi.");
  }
  const raw = (b.messages ?? []) as unknown[];
  if (raw.length > MAX_MESSAGES) throw new ValidationError("La conversazione è troppo lunga.");
  const messages = raw.map((m) => {
    const from = (m as Record<string, unknown>)?.from;
    const text = (m as Record<string, unknown>)?.text;
    if ((from !== "agente" && from !== "cliente") || typeof text !== "string" || !text.trim()) {
      throw new ValidationError("Messaggio della conversazione non valido.");
    }
    if (text.length > MAX_TEXT) throw new ValidationError("Un messaggio è troppo lungo.");
    return { from, text: text.trim() } as const;
  });
  return { request, messages };
}

const DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const SLOTS = ["10:00", "15:00", "18:00"];

/** Giorno di oggi a Roma, indipendente dal fuso del server. */
export function todayInRome(now: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now).split("-").map(Number);
  return { y: parts[0], m: parts[1], d: parts[2] };
}

/** Fasce proposte nei prossimi giorni lavorativi (lunedì-sabato), come nel simulatore. */
export function availability(today: { y: number; m: number; d: number }, days = 5): string[] {
  const out: string[] = [];
  const date = new Date(Date.UTC(today.y, today.m - 1, today.d));
  while (out.length < days * SLOTS.length) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() === 0) continue; // la domenica no
    for (const slot of SLOTS) {
      out.push(`${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} alle ${slot}`);
    }
  }
  return out;
}

/** Testo passato al modello: data, disponibilità, richiesta e conversazione. */
export function buildPrompt(req: DraftRequest, now: Date = new Date()): string {
  const t = todayInRome(now);
  const weekday = DAYS[new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay()];
  const lines = [
    `Oggi è ${weekday} ${t.d} ${MONTHS[t.m - 1]} ${t.y}.`,
    "Disponibilità di Annamaria (indicative: le conferma lei prima di inviare):",
    ...availability(t).map((s) => `- ${s}`),
    "",
    `Richiesta arrivata dal sito:\n${req.request}`,
  ];
  if (req.messages.length > 0) {
    lines.push("", "Conversazione finora:");
    for (const m of req.messages) lines.push(`${m.from === "agente" ? "ASSISTENTE" : "CLIENTE"}: ${m.text}`);
  }
  lines.push("", "Scrivi il prossimo messaggio.");
  return lines.join("\n");
}
