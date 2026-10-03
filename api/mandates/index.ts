import { requireApiKey } from "../../lib/auth";
import { ValidationError, createMandate, listMandates, parseMandate } from "../../lib/mandates";

// Endpoint RISERVATO: elenco e creazione degli incarichi.
export default async function handler(req, res) {
  // Dati personali: mai in cache.
  res.setHeader("Cache-Control", "no-store");

  if (!requireApiKey(req, res)) {
    return;
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ success: true, items: await listMandates() });
    }
    if (req.method === "POST") {
      const item = await createMandate(parseMandate(req.body));
      return res.status(201).json({ success: true, item });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    // Il dettaglio resta nei log: la risposta non espone dati interni.
    console.error(`${req.method} /api/mandates error:`, e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
