import { requireApiKey } from "../lib/auth";
import { ValidationError, changesSince, parseRecords, parseSince, saveRecords } from "../lib/records";

// Endpoint RISERVATO: sincronizzazione del CRM tra i dispositivi.
// GET ?since=N  → schede cambiate dopo il punto N
// POST {records} → salva o elimina schede (vince l'ultima arrivata)
export default async function handler(req, res) {
  // Dati personali: mai in cache.
  res.setHeader("Cache-Control", "no-store");

  if (!requireApiKey(req, res)) {
    return;
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ success: true, ...(await changesSince(parseSince(req.query?.since))) });
    }
    if (req.method === "POST") {
      return res.status(200).json({ success: true, ...(await saveRecords(parseRecords(req.body))) });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    // Il dettaglio resta nei log: la risposta non espone dati interni.
    console.error(`${req.method} /api/records error:`, e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
