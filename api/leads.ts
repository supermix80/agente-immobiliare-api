import { requireApiKey } from "../lib/auth";
import { sql } from "../lib/db";
import { ensureArchiveColumn } from "../lib/leads-archive";

// Testo facoltativo ripulito e limitato in lunghezza; vuoto diventa null.
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = String(value).trim().slice(0, max);
  return cleaned.length > 0 ? cleaned : null;
}

// Valore semplice (numero o testo breve) passato com'è al database, come prima; altro diventa null.
function scalar(value: unknown): number | string | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return text(value, 40);
}

/**
 * Aggiunge alle note i consensi e la provenienza inviati dal form.
 * La tabella non ha colonne dedicate: così l'informazione resta comunque registrata, con data e ora.
 */
function notesWithConsent(lead): string | null {
  const parts: string[] = [];
  const notes = text(lead.notes, 2000);
  if (notes) parts.push(notes);
  if (typeof lead.privacyConsent === "boolean") {
    parts.push(
      `Consenso privacy: ${lead.privacyConsent ? "sì" : "no"} (${new Date().toISOString()})` +
        ` · marketing: ${lead.marketingConsent === true ? "sì" : "no"}`
    );
  }
  const referral = text(lead.referralSource, 64);
  if (referral) parts.push(`Provenienza: ${referral}`);
  const campaign = text(lead.campaign, 64);
  if (campaign) parts.push(`Campagna: ${campaign}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://navolioappstudio.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization");
  // Risposte con dati personali: mai in cache.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST pubblico: è il form della landing.
  if (req.method === "POST") {
    const lead = req.body && typeof req.body === "object" ? req.body : {};
    const name = text(lead.name, 200);
    const phone = text(lead.phone, 40);
    const email = text(lead.email, 200);

    // Senza nome e senza un recapito il lead non è lavorabile: non si salva.
    if (!name || name.length < 2 || (!phone && !email)) {
      return res.status(400).json({ success: false, error: "Nome e un recapito (telefono o email) sono obbligatori." });
    }

    try {
      const result = await sql`
        insert into leads (
          name, phone, email, address, mq, price,
          urgency, notes, source, channel, agent, agency
        ) values (
          ${name},
          ${phone},
          ${email},
          ${text(lead.address, 300)},
          ${scalar(lead.mq)},
          ${scalar(lead.price)},
          ${text(lead.urgency, 80)},
          ${notesWithConsent(lead)},
          ${text(lead.source, 80)},
          ${text(lead.channel, 80)},
          ${text(lead.agent, 120)},
          ${text(lead.agency, 120)}
        )
        returning id
      `;

      // Si restituisce solo l'identificativo: i dati li ha già chi ha compilato il form.
      return res.status(200).json({ success: true, leadId: result[0]?.id ?? null });
    } catch (e) {
      console.error("POST /api/leads error:", e);
      return res.status(500).json({ success: false, error: "Database insert failed" });
    }
  }

  // GET riservato: elenco dei lead per l'app.
  if (req.method === "GET") {
    if (!requireApiKey(req, res)) {
      return;
    }
    try {
      // I lead archiviati (prove, doppi) restano nel database ma non arrivano all'app
      await ensureArchiveColumn();
      const rows = await sql`
        select * from leads
        where archived_at is null
        order by created_at desc
      `;
      return res.status(200).json(rows);
    } catch (e) {
      console.error("GET /api/leads error:", e);
      return res.status(500).json({ success: false, error: "Database read failed" });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
