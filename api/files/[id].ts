import { requireApiKey } from "../../lib/auth";
import { ValidationError, deleteFile, parseFile, parseId, readFile, saveFile } from "../../lib/files";

// Endpoint RISERVATO: file dei documenti dei clienti (uno per documento della checklist).
// PUT {contactId, filename, contentType, data(base64)} · GET · DELETE
export default async function handler(req, res) {
  // Documenti personali: mai in cache.
  res.setHeader("Cache-Control", "no-store");

  if (!requireApiKey(req, res)) {
    return;
  }

  try {
    const id = parseId(req.query?.id);
    if (req.method === "PUT") {
      return res.status(200).json({ success: true, ...(await saveFile(id, parseFile(req.body))) });
    }
    if (req.method === "GET") {
      const file = await readFile(id);
      if (!file) return res.status(404).json({ success: false, error: "File non trovato." });
      return res.status(200).json({ success: true, file });
    }
    if (req.method === "DELETE") {
      await deleteFile(id);
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    console.error(`${req.method} /api/files error:`, e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
