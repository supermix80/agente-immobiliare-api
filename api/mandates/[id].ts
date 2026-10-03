import { requireApiKey } from "../../lib/auth";
import { ValidationError, deleteMandate, isUuid, parseMandate, updateMandate } from "../../lib/mandates";

// Endpoint RISERVATO: modifica e cancellazione di un incarico.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!requireApiKey(req, res)) {
    return;
  }

  const id = req.query?.id;
  if (!isUuid(id)) {
    return res.status(404).json({ success: false, error: "Incarico non trovato." });
  }

  try {
    if (req.method === "PUT") {
      const item = await updateMandate(id, parseMandate(req.body));
      if (!item) {
        return res.status(404).json({ success: false, error: "Incarico non trovato." });
      }
      return res.status(200).json({ success: true, item });
    }
    if (req.method === "DELETE") {
      if (!(await deleteMandate(id))) {
        return res.status(404).json({ success: false, error: "Incarico non trovato." });
      }
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    console.error(`${req.method} /api/mandates/[id] error:`, e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
