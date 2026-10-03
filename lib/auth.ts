import { createHash, timingSafeEqual } from "node:crypto";

// Sotto questa lunghezza la chiave è considerata non configurata.
const MIN_KEY_LENGTH = 32;

// Impronta a lunghezza fissa, per confrontare le chiavi a tempo costante.
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Chiave inviata dal client: header X-API-Key oppure Authorization: Bearer.
function providedKey(req): string {
  const direct = req.headers["x-api-key"];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers["authorization"] ?? ""));
  return match ? match[1].trim() : "";
}

/**
 * Protegge gli endpoint riservati (dati personali).
 * Restituisce true se la richiesta può procedere; altrimenti ha già risposto.
 * Fail-closed: senza LEADS_API_KEY configurata non viene mai esposto nulla.
 */
export function requireApiKey(req, res): boolean {
  const expected = (process.env.LEADS_API_KEY ?? "").trim();
  if (expected.length < MIN_KEY_LENGTH) {
    console.error("LEADS_API_KEY assente o troppo corta: endpoint riservati chiusi.");
    res.status(503).json({ success: false, error: "Servizio non configurato." });
    return false;
  }
  const provided = providedKey(req);
  const matches = timingSafeEqual(sha256(provided), sha256(expected));
  if (!matches || provided.length === 0) {
    res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({ success: false, error: "Non autorizzato." });
    return false;
  }
  return true;
}
