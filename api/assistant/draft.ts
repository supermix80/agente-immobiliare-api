import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { requireApiKey } from "../../lib/auth";
import { ASSISTANT_RULES } from "../../lib/assistant-rules";
import { DraftSchema, ValidationError, buildPrompt, parseDraftRequest } from "../../lib/assistant";

// Endpoint RISERVATO: bozza della prossima risposta a un lead.
// Riceve la richiesta del sito e la conversazione, restituisce la bozza. Non invia nulla.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireApiKey(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  // Senza la chiave del modello l'assistente è spento: lo si dice in chiaro.
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ success: false, error: "Assistente non configurato (manca ANTHROPIC_API_KEY)." });
  }

  try {
    const draftRequest = parseDraftRequest(req.body);
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: ASSISTANT_RULES,
      messages: [{ role: "user", content: buildPrompt(draftRequest) }],
      // Risposte brevi da chat: poco ragionamento basta. Formato JSON garantito dallo schema.
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      // Se il modello rifiuta, l'API riprova da sola su un modello di riserva.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("assistant/draft: nessuna bozza", response.stop_reason, response._request_id);
      return res.status(502).json({ success: false, error: "L'assistente non ha prodotto una bozza. Scrivi tu la risposta." });
    }
    return res.status(200).json({ success: true, draft: response.parsed_output });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json({ success: false, error: e.message });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ success: false, error: "Troppe richieste all'assistente, riprova tra poco." });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("assistant/draft: errore del modello", e.status, e.message);
      return res.status(502).json({ success: false, error: "L'assistente non risponde, riprova tra poco." });
    }
    console.error("POST /api/assistant/draft error:", e);
    return res.status(500).json({ success: false, error: "Errore interno." });
  }
}
