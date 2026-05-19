import express from "express";
import path from "path";
import cors from "cors";
import got from "got";
import { jsPDF } from "jspdf";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.post("/api/pdf", async (req, res) => {
  const { url, orientation = "portrait" } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  try {
    // 1. سحب السورس كود الخاص بالموقع كمحتوى نصي
    const response = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: { request: 10000 },
      retry: { limit: 1 }
    });

    // تنظيف النص لضمان التوافق
    const htmlText = response.body || "No content found";

    // 2. توليد ملف PDF نقي ومعالجة النصوص برمجياً بدون ميموري عالية
    const doc = new jsPDF({
      orientation: orientation === "landscape" ? "l" : "p",
      unit: "mm",
      format: "a4"
    });

    // تقسيم النص السورس لأسطر لكي يتناسب مع أبعاد الـ PDF
    const textLines = doc.splitTextToSize(htmlText.substring(0, 50000), 180); 
    doc.text(textLines, 15, 15);

    // تحويله إلى Buffer وإرساله
    const pdfOutput = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfOutput);

    res.contentType("application/pdf");
    res.send(pdfBuffer);

  } catch (error: any) {
    console.error(`Rendering Error for ${url}:`, error.message);
    res.status(500).json({ 
      error: "Extraction Pipeline Failed", 
      details: error.message 
    });
  }
});

// Proxy Endpoint
app.get("/api/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required" });
  try {
    const response = await got(url as string, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    res.send(response.body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (req: any, res: any) => {
  if (req.path.startsWith("/api")) return;
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => console.log(`Stable LightEngine running on ${PORT}`));

export default app;
