import got from "got";

export default async function handler(req, res) {
  // تفعيل إعدادات CORS لبيئة Serverless
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  try {
    // جلب كود الـ HTML الحقيقي للموقع بسرعة فائقة وبدون أي لود
    const response = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
      },
      timeout: { request: 15000 },
      retry: { limit: 1 },
      followRedirect: true
    });

    // إرسال الـ HTML الخام مباشرة للواجهة الأمامية
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ 
      success: true,
      html: response.body 
    });

  } catch (error) {
    console.error(`Fetch Error for ${url}:`, error.message);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to fetch site target blueprint", 
      details: error.message 
    });
  }
}
