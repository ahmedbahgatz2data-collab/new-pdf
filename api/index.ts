import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import chromium from "@sparticuz/chromium-min";
import got from "got";

// @ts-ignore
puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// دالة تهيئة المتصفح باستخدام الرابط السحابي المباشر لـ Chromium المستقر
async function getBrowserInstance() {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // تحميل الخطوط لدعم اللغة العربية والإيموجي ومنع المربعات الفارغة
    await chromium.font("https://raw.githack.com/wiki/jaimecbernardo/GFontsSpace/fonts/NotoColorEmoji.ttf");
    
    return await puppeteer.launch({
      args: [
        ...chromium.args,
        "--hide-scrollbars",
        "--disable-web-security",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--single-process"
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(
        "https://github.com/sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
      ),
      headless: chromium.headless,
    });
  } else {
    const localPath = process.platform === "win32"
      ? "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe"
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    return await puppeteer.launch({
      args: [],
      executablePath: fs.existsSync(localPath) ? localPath : undefined,
      headless: true,
    });
  }
}

// Proxy Endpoint
app.get("/api/proxy", async (req, res) => {
  const { url, enhanced } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required" });
  const targetUrl = typeof url === "string" ? url : (url as string[])[0];

  try {
    const isEnhanced = enhanced === "true";
    const options: any = {
      retry: { limit: 1 },
      timeout: { request: 12000 },
      http2: true,
      followRedirect: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    };

    if (isEnhanced) {
      options.headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
      options.headers["Accept-Language"] = "en-US,en;q=0.9";
      options.headers["Cache-Control"] = "no-cache";
    }

    const response = await got(targetUrl, options);
    res.send(response.body);
  } catch (proxyError: any) {
    console.error(`Proxy Error for ${targetUrl}:`, proxyError.message);
    res.status(500).json({ error: "Proxy routing failed", details: proxyError.message });
  }
});

// PDF Generation Endpoint
app.post("/api/pdf", async (req, res) => {
  const { url, pageSize = "A4", orientation = "portrait", includeBackground = true, waitMode = "auto", manualWaitTime = 2000, fullPage = false } = req.body;
  if (!url) return res.status(400).json({ error: "URL parameter is required" });

  let browser: any = null;
  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();
    
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    if (waitMode === "manual") {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await new Promise(resolve => setTimeout(resolve, Number(manualWaitTime)));
    } else {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    }

    const pdfBuffer = await page.pdf({
      format: pageSize,
      landscape: orientation === "landscape",
      printBackground: includeBackground,
      preferCSSPageSize: true,
      fullPage: fullPage
    });

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (navError: any) {
    console.error(`Navigation or Rendering Error for ${url}:`, navError.message);
    const isTimeout = navError.name === "TimeoutError" || navError.message.includes("timeout");
    res.status(isTimeout ? 408 : 500).json({ 
      error: isTimeout ? "Navigation Timeout" : "Failed to load page", 
      details: navError.message,
      environment: process.env.NODE_ENV === "production" ? "Production" : "Development" 
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { console.error("Error closing browser:", e); }
    }
  }
});

const setupServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any) => {
      if (req.path.startsWith("/api")) return;
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, () => {
    console.log(`Server executing at http://localhost:${PORT}`);
  });
};

setupServer();

export default app;
