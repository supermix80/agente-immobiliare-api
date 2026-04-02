let leads = []

export default function handler(req, res) {
  if (req.method === "POST") {
    const lead = req.body
    lead.id = Date.now()

    leads.push(lead)

    return res.status(200).json({ success: true, lead })
  }

  if (req.method === "GET") {
    return res.status(200).json(leads)
  }

  res.status(405).end()
}
