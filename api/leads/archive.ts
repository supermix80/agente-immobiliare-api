import { requireApiKey } from "../../lib/auth";
import { ValidationError, parseArchiveRequest, setArchived } from "../../lib/leads-archive";

// Endpoint RISERVATO: archivia (o ripristina) dei lead. Niente viene cancellato dal database.
// POST { ids: [...], archived: true|false }
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!requireApiKey(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { ids, archived } = parseArchiveRequest(req.body);
    return res.status(200).json({ success: true, changed: await setArchived(ids, archived) });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    console.error("POST /api/leads/archive error:", e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
