import got from "got";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const response = await got(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: { request: 10000 }
    });
    return res.status(200).send(response.body);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
