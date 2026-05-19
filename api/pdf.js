import got from "got";

export default async function handler(req, res) {
  // إعدادات الـ CORS لبيئة Serverless
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
    // استخدام محرك سحابي عام ومستقر ومفتوح تماماً لعمل الـ Render بصورة صحيحة 
    // وتحويل الرابط إلى PDF منسق بكامل الـ CSS والجرافيكس بدون استهلاك سيرفرك
    const renderServiceUrl = `https://api.html2pdf.app/v1/generate?url=${encodeURIComponent(url)}&apiKey=public`;

    const response = await got(renderServiceUrl, {
      responseType: "buffer",
      timeout: { request: 25000 }, // مهلة كافية لعمل رندر كامل للموقع
      retry: { limit: 1 }
    });

    res.setHeader("Content-Type", "application/pdf");
    return res.status(200).send(response.body);

  } catch (error) {
    console.error("Cloud Render Failed, falling back to basic proxy capture:", error.message);
    
    // Fallback خطة بديلة: إذا فشل السيرفر السحابي، نقوم بسحب لقطة سريعة عبر محرك سحابي آخر مجاني
    try {
      const fallbackUrl = `https://render-tron.appspot.com/render/${encodeURIComponent(url)}`;
      const fallbackResponse = await got(fallbackUrl, { timeout: { request: 15000 } });
      
      return res.status(200).json({ 
        error: "Direct PDF engine busy", 
        htmlFallback: fallbackResponse.body,
        hint: "Front-end can render this directly using html2canvas"
      });
    } catch (fallbackError) {
      return res.status(500).json({ error: "All PDF Generation pipelines are exhausted", details: error.message });
    }
  }
}
