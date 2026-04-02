import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://navolioappstudio.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "POST") {
    try {
      const lead = req.body;

      const result = await sql`
        insert into leads (
          name, phone, email, address, mq, price,
          urgency, notes, source, channel, agent, agency
        ) values (
          ${lead.name ?? null},
          ${lead.phone ?? null},
          ${lead.email ?? null},
          ${lead.address ?? null},
          ${lead.mq ?? null},
          ${lead.price ?? null},
          ${lead.urgency ?? null},
          ${lead.notes ?? null},
          ${lead.source ?? null},
          ${lead.channel ?? null},
          ${lead.agent ?? null},
          ${lead.agency ?? null}
        )
        returning *
      `;

      return res.status(200).json({ success: true, lead: result[0] });
    } catch (e) {
      console.error("POST /api/leads error:", e);
      return res.status(500).json({ success: false, error: "Database insert failed" });
    }
  }

  if (req.method === "GET") {
    try {
      const rows = await sql`
        select * from leads
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
