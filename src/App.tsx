import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import axios from "axios";
import { 
  Printer, 
  Loader2, 
  Download, 
  AlertCircle, 
  Globe, 
  Settings, 
  Clock, 
  CheckCircle2,
  Cpu,
  Layers,
  FileArchive
} from "lucide-react";

interface PrintStatus {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  blob?: Blob;
}

interface ApiResponse {
  success: boolean;
  html?: string;
  error?: string;
}

export default function App() {
  const [urlsInput, setUrlsInput] = useState("");
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastZipUrl, setLastZipUrl] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState("a4"); // القيمة الافتراضية بالـ lowercase لتطابق jsPDF
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [includeBackground, setIncludeBackground] = useState(true);
  const [fullPage, setFullPage] = useState(false);
  const [waitMode, setWaitMode] = useState<'auto' | 'manual'>('auto');
  const [manualWaitTime, setManualWaitTime] = useState("3000"); // القيمة الافتراضية الآمنة 3 ثوانٍ
  const [statuses, setStatuses] = useState<PrintStatus[]>([]);

  // دالة ذكية لتحويل أبعاد مقاسات الورق بالمليمتر (mm) بناءً على المقاس المختار والاتجاه
  const getPageDimensions = (size: string, orient: "portrait" | "landscape") => {
    // الأبعاد الافتراضية بالمليمتر للـ Portrait
    let width = 210;
    let height = 297;

    switch (size) {
      case "a0": width = 841; height = 1189; break;
      case "a1": width = 594; height = 841; break;
      case "a2": width = 420; height = 594; break;
      case "a3": width = 297; height = 420; break;
      case "a4": width = 210; height = 297; break;
      case "a5": width = 148; height = 210; break;
      case "a6": width = 105; height = 148; break;
      case "a7": width = 74; height = 105; break;
      case "a8": width = 52; height = 74; break;
      case "a9": width = 37; height = 52; break;
      case "a10": width = 26; height = 37; break;
      case "b0": width = 1000; height = 1414; break;
      case "b1": width = 707; height = 1000; break;
      case "b2": width = 500; height = 707; break;
      case "b3": width = 353; height = 500; break;
      case "b4": width = 250; height = 353; break;
      case "b5": width = 176; height = 250; break;
      case "b6": width = 125; height = 176; break;
      case "b7": width = 88; height = 125; break;
      case "b8": width = 62; height = 88; break;
      case "b9": width = 44; height = 62; break;
      case "b10": width = 31; height = 44; break;
      case "letter": width = 216; height = 279; break;
      case "legal": width = 216; height = 356; break;
      case "ledger": width = 279; height = 432; break;
    }

    // إذا كان الاتجاه Landscape، نقوم بتبديل العرض والارتفاع
    return orient === "landscape" 
      ? { pageWidth: height, pageHeight: width } 
      : { pageWidth: width, pageHeight: height };
  };

  const convertHtmlToPdfBlob = async (htmlContent: string): Promise<Blob> => {
    // جلب أبعاد الصفحة المختارة بدقة
    const { pageWidth, pageHeight } = getPageDimensions(pageSize, orientation);

    // 1. إنشاء حاوية مؤقتة مرنة تعتمد على النسبة المئوية للمقاس المختار لتجبر المحتوى على ملء العرض
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0px';
    // جعل العرض مرن ومنطقي بناءً على الورقة لملء كامل المساحة
    tempContainer.style.width = orientation === "landscape" ? "1600px" : "1200px";
    tempContainer.style.background = "#ffffff"; // خلفية بيضاء افتراضية لمنع الشفافية
    tempContainer.innerHTML = htmlContent;
    document.body.appendChild(tempContainer);

    // 2. مهلة انتظار ذكية وممتدة لضمان تحميل وتفسير كامل عناصر الصفحة والـ CSS والصور الاستاتيكية
    const delayTime = waitMode === 'manual' ? Number(manualWaitTime) : 4000; // رفع التلقائي لـ 4 ثوانٍ لضمان الأمان الاستاتيكي
    await new Promise((resolve) => setTimeout(resolve, delayTime));

    // 3. التقاط محتوى الحاوية بدقة
    const canvas = await html2canvas(tempContainer, {
      useCORS: true,
      allowTaint: true,
      scale: 1.0, // مقياس متوازن جداً لمنع تضخم حجم الملف
      logging: false,
      imageTimeout: 30000 // مهلة 30 ثانية لانتظار الصور الثقيلة من السيرفرات الخارجية
    });

    // جودة الـ JPEG مجهزه على 75% لضغط الحجم لأقصى درجة ممكنة مع الحفاظ على وضوح الخطوط
    const imgData = canvas.toDataURL('image/jpeg', 0.75); 

    // 4. إنشاء الـ PDF وتفعيل الـ Compression الداخلي
    const pdf = new jsPDF({
      orientation: orientation === 'landscape' ? 'l' : 'p',
      unit: 'mm',
      format: pageSize,
      compress: true // تفعيل الضغط لتقليل حجم الـ PDF الناتج
    });
    
    // حساب الأبعاد والارتفاعات التناسبية لملء العرض 100% بدون مسافات غريبة
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    // إضافة الصفحة الأولى (ستملأ العرض بالكامل لأننا نستخدم pageWidth كعرض للصورة المضافة)
    pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    // تقسيم باقي المحتوى الطولي تلقائياً على صفحات منفصلة متتالية
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    const pdfOutput = pdf.output('blob');
    
    // تنظيف رامات المتصفح فوراً وحذف الحاوية من الـ DOM
    document.body.removeChild(tempContainer);

    return pdfOutput;
  };

  const handleProcess = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLastZipUrl(null);

    const urls = urlsInput
      .split("\n")
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urls.length === 0) {
      setError("Please enter at least one valid URL.");
      return;
    }

    setIsPrinting(true);
    const initialStatuses = urls.map(url => ({ url, status: 'pending' as const }));
    setStatuses(initialStatuses);

    const zip = new JSZip();
    let hasSuccessfulFiles = false;

    for (let i = 0; i < urls.length; i++) {
      const targetUrl = urls[i];
      setStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'processing' } : s));

      try {
        const response = await axios.post<ApiResponse>("/api/pdf", {
          url: targetUrl,
          pageSize,
          orientation,
          includeBackground,
          waitMode,
          manualWaitTime,
          fullPage
        });

        if (!response.data || !response.data.success || !response.data.html) {
          throw new Error(response.data.error || "Failed to fetch source blueprint from serverless proxy");
        }

        const blob = await convertHtmlToPdfBlob(response.data.html);
        
        const safeName = `capture_${i + 1}_${targetUrl.replace(/https?:\/\/(www\.)?/, "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        zip.file(safeName, blob);
        hasSuccessfulFiles = true;

        setStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'completed', blob } : s));
      } catch (err: any) {
        setStatuses(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error', error: err.message || "Capture Failed" } : s));
      }
    }

    if (hasSuccessfulFiles) {
      const content = await zip.generateAsync({ type: "blob" });
      setLastZipUrl(URL.createObjectURL(content));
    } else {
      setError("All PDF generation tasks failed.");
    }
    setIsPrinting(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      <header className="h-16 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center shadow-inner">
            <Layers className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Paperless.io</h1>
            <p className="text-[11px] text-zinc-500 font-medium tracking-wide uppercase">Bulk Web-to-PDF Capture Engine</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleProcess} className="lg:col-span-5 space-y-5">
            <section className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-zinc-400" />
                  <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">Target Selection</h2>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">URLs Queue (One URL per line)</label>
                <textarea
                  value={urlsInput}
                  onChange={(e) => setUrlsInput(e.target.value)}
                  disabled={isPrinting}
                  placeholder="https://example.com"
                  className="w-full h-44 bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-sm font-mono focus:outline-none focus:border-zinc-700 transition resize-none disabled:opacity-50 text-zinc-300 placeholder:text-zinc-700"
                />
              </div>
            </section>

            <section className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
                <Settings className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">Synthesis Controls</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-500 font-medium uppercase">Page Size</label>
                  <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="w-full bg-zinc-950 border border-zinc-900 rounded-lg p-2 text-xs font-medium focus:outline-none text-zinc-200">
                    {/* إضافة كل مقاسات الصفحات القياسية المتاحة بمكتبة jsPDF */}
                    <optgroup label="A Series">
                      <option value="a0">A0 Massive</option>
                      <option value="a1">A1 Poster</option>
                      <option value="a2">A2 Blueprint</option>
                      <option value="a3">A3 Overview</option>
                      <option value="a4">A4 Standard</option>
                      <option value="a5">A5 Booklet</option>
                      <option value="a6">A6 Pocket</option>
                      <option value="a7">A7 Card</option>
                      <option value="a8">A8 Micro</option>
                      <option value="a9">A9 Label</option>
                      <option value="a10">A10 Tiny</option>
                    </optgroup>
                    <optgroup label="B Series">
                      <option value="b0">B0</option>
                      <option value="b1">B1</option>
                      <option value="b2">B2</option>
                      <option value="b3">B3</option>
                      <option value="b4">B4</option>
                      <option value="b5">B5</option>
                      <option value="b6">B6</option>
                      <option value="b7">B7</option>
                      <option value="b8">B8</option>
                      <option value="b9">B9</option>
                      <option value="b10">B10</option>
                    </optgroup>
                    <optgroup label="American Standard">
                      <option value="letter">Letter Default</option>
                      <option value="legal">Legal Extended</option>
                      <option value="ledger">Ledger Corporate</option>
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-500 font-medium uppercase">Orientation</label>
                  <select value={orientation} onChange={(e) => setOrientation(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-900 rounded-lg p-2 text-xs font-medium focus:outline-none text-zinc-200">
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              </div>
              <div className="pt-2 space-y-3 border-t border-zinc-900">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={includeBackground} onChange={(e) => setIncludeBackground(e.target.checked)} className="rounded bg-zinc-950 border-zinc-900 text-zinc-700 focus:ring-0 focus:ring-offset-0" />
                  <span className="text-xs text-zinc-300 font-medium">Print Background Graphics</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={fullPage} onChange={(e) => setFullPage(e.target.checked)} className="rounded bg-zinc-950 border-zinc-900 text-zinc-700 focus:ring-0 focus:ring-offset-0" />
                  <span className="text-xs text-zinc-300 font-medium">Capture Full Page</span>
                </label>
              </div>
            </section>

            <button type="submit" disabled={isPrinting} className="w-full h-11 bg-zinc-100 hover:bg-white text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-600 font-semibold text-xs tracking-wider uppercase rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer">
              {isPrinting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Printer className="w-4 h-4" /> Trigger Capture Sequence</>}
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {error && (
              <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300 font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {lastZipUrl && (
              <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-700">
                    <FileArchive className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">Ready Archive Compiled</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">Contains all extracted documents</p>
                  </div>
                </div>
                <a href={lastZipUrl} download="paperless_captures.zip" className="h-8 px-4 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-bold tracking-tight transition flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download ZIP
                </a>
              </div>
            )}

            <section className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-5 flex flex-col h-[520px]">
              <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-4 shrink-0">
                <Clock className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">Live Pipeline Stream</h2>
              </div>
              <div className="flex-1 overflow-auto space-y-2.5 pr-1 font-mono">
                {statuses.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-700">
                    <Cpu className="w-8 h-8 mb-2 stroke-[1.5]" />
                    <p className="text-xs tracking-tight">Stream Idle. Waiting for input execution.</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {statuses.map((item, index) => (
                      <motion.div key={index} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-zinc-900/50 border border-zinc-900 rounded-xl flex items-center justify-between text-xs gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-400 truncate font-mono tracking-tight">{item.url}</p>
                          <span className="text-[10px] text-zinc-600">PIPELINE_JOB_ID: #00{index+1}</span>
                        </div>
                        <div className="shrink-0">
                          {item.status === 'pending' && <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-500 text-[10px] uppercase">Pending</span>}
                          {item.status === 'processing' && <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] uppercase flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Rendering</span>}
                          {item.status === 'completed' && <span className="px-2 py-0.5 bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 rounded text-[10px] uppercase flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Done</span>}
                          {item.status === 'error' && <span className="px-2 py-0.5 bg-red-950/50 border border-red-900/50 text-red-400 rounded text-[10px] uppercase">Error</span>}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="h-10 bg-zinc-900 border-t border-zinc-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Capture Engine Active</span>
          </div>
          <div className="w-px h-4 bg-zinc-800"></div>
          <span className="text-[13px] text-zinc-500 font-mono">v1-stable • By ENG Ahmed Bahgat</span>
        </div>
      </footer>
    </div>
  );
}
