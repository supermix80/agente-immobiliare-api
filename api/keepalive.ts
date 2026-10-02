import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

// Richiamo giornaliero (vedi vercel.json): una lettura minima tiene attivo il
// database, che sul piano gratuito viene messo in pausa dopo un periodo di inattività.
// Non restituisce alcun dato.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    await sql`select 1`;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("keepalive error:", e);
    return res.status(500).json({ ok: false });
  }
}
