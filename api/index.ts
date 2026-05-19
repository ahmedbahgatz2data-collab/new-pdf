import express from "express";
import path from "path";
import cors from "cors";
import got from "got";
import PDFDocument from "pdfkit";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Endpoint تحويل الرابط إلى PDF مستقر ونقي
app.post("/api/pdf", async (req, res) => {
  const { url, orientation = "portrait" } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  try {
    // 1. جلب سورس الصفحة كـ HTML نصي
    const response = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: { request: 12000 },
      retry: { limit: 1 }
    });

    const htmlText = response.body || "No content fetched";

    // 2. إنشاء مستند PDFKit في الـ Memory
    const doc = new PDFDocument({
      size: "A4",
      layout: orientation === "landscape" ? "landscape" : "portrait",
      margin: 30
    });

    // تحويل الـ Stream إلى Buffer لإرساله كمستند كامل
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);
      res.contentType("application/pdf");
      res.send(pdfBuffer);
    });

    // إضافة النص داخل الـ PDF بشكل منسق وآمن
    doc.fontSize(10).font("Helvetica").text(htmlText.substring(0, 40000), {
      align: "left",
      lineGap: 4
    });

    // إنهاء المستند وإغلاقه
    doc.end();

  } catch (error) {
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
    const response = await got(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    res.send(response.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تشغيل الـ Static Files للملفات المبنية (Frontend)
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return;
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => console.log(`Stable Native Engine running on ${PORT}`));

export default app;
