let leads = []

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://navolioappstudio.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "POST") {
    const lead = req.body;
    lead.id = Date.now();

    leads.push(lead);

    return res.status(200).json({ success: true, lead });
  }

  if (req.method === "GET") {
    return res.status(200).json(leads);
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
