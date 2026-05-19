import got from "got";
import { jsPDF } from "jspdf";

export default async function handler(req, res) {
  // تفعيل الـ CORS يدوياً لبيئة الـ Serverless
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, orientation = "portrait" } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  try {
    // 1. سحب كود الصفحة النصي
    const response = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: { request: 10000 },
      retry: { limit: 1 }
    });

    const htmlText = response.body || "No content fetched";

    // 2. توليد مستند PDF خفيف جداً متوافق 100% مع الـ Vercel Memory
    const doc = new jsPDF({
      orientation: orientation === "landscape" ? "l" : "p",
      unit: "mm",
      format: "a4"
    });

    const textLines = doc.splitTextToSize(htmlText.substring(0, 30000), 180);
    doc.text(textLines, 15, 15);

    const pdfOutput = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfOutput);

    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error("PDF Generation Error:", error.message);
    return res.status(500).json({ error: "Pipeline Failed", details: error.message });
  }
}
