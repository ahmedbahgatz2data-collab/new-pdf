import express from "express";
import path from "path";
import cors from "cors";
import got from "got";
// @ts-ignore
import htmlPdf from "html-pdf-node"; 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// دالة سحب محتوى الصفحة وتحويلها لـ PDF بجودة عالية بدون متصفح تقيل
app.post("/api/pdf", async (req, res) => {
  const { url, pageSize = "A4", orientation = "portrait" } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  try {
    // 1. سحب كود الـ HTML الحقيقي للموقع بسرعة فائقة
    const response = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: { request: 15000 },
      retry: { limit: 1 }
    });

    const htmlContent = response.body;

    // 2. إعداد خيارات الطباعة والـ PDF
    const options = { 
      format: pageSize,
      landscape: orientation === "landscape",
      printBackground: true
    };
    
    const file = { content: htmlContent };

    // 3. توليد الـ PDF مباشرة في الـ Memory
    htmlPdf.generatePdf(file, options).then((pdfBuffer: Buffer) => {
      res.contentType("application/pdf");
      res.send(pdfBuffer);
    }).catch((err: any) => {
      throw err;
    });

  } catch (error: any) {
    console.error(`Rendering Error for ${url}:`, error.message);
    res.status(500).json({ 
      error: "Failed to generate PDF via LightEngine", 
      details: error.message 
    });
  }
});

// Proxy Endpoint المستقر
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

app.listen(PORT, () => console.log(`Engine running on ${PORT}`));

export default app;
