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
  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [includeBackground, setIncludeBackground] = useState(true);
  const [fullPage, setFullPage] = useState(false);
  const [waitMode, setWaitMode] = useState<'auto' | 'manual'>('auto');
  const [manualWaitTime, setManualWaitTime] = useState("2000");
  const [statuses, setStatuses] = useState<PrintStatus[]>([]);

  // دالة داخلية سريعة لتحويل سورس الـ HTML المستلم محلياً إلى ملف PDF منسق
  const convertHtmlToPdfBlob = async (htmlContent: string): Promise<Blob> => {
    // 1. إنشاء حاوية مؤقتة مخفية لحقن الـ HTML مع الحفاظ على أبعاد شاشة الكمبيوتر لضمان الـ Desktop View
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0px';
    tempContainer.style.width = '1280px'; // عرض قياسي لمنع تداخل العناصر والـ Responsive Breakpoints
    tempContainer.innerHTML = htmlContent;
    document.body.appendChild(tempContainer);

    // انتظر أجزاء من الثانية لضمان استقرار الـ Styles داخلياً قبل التقاطها
    await new Promise((resolve) => setTimeout(resolve, Number(waitMode === 'manual' ? manualWaitTime : 500)));

    // 2. التقاط لقطة شاشة دقيقة بكامل التنسيقات والألوان
    const canvas = await html2canvas(tempContainer, {
      useCORS: true,
      allowTaint: true,
      scale: 1.5, // درجة وضوح ممتازة متوازنة مع حجم الملف
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');

    // 3. إعداد مستند الـ jsPDF وتوزيع الصفحات تلقائياً
    const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', pageSize.toLowerCase() as any);
    
    // حساب الأبعاد بناءً على المقاس المختار
    const imgWidth = orientation === 'landscape' ? 297 : 210; // افتراضي A4
    const pageHeight = orientation === 'landscape' ? 210 : 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const pdfOutput = pdf.output('blob');
    
    // تنظيف الـ DOM وحذف الحاوية فوراً لحماية رامات متصفح المستخدم
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
        // 1. استدعاء السيرفر لجلب كود الـ HTML الخاص بالموقع
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

        // 2. استدعاء دالة التحويل لإنتاج الـ PDF Blob محلياً في جهاز العميل
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
                  <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="w-full bg-zinc-950 border border-zinc-900 rounded-lg p-2 text-xs font-medium focus:outline-none">
                    <option value="A4">A4 Standard</option>
                    <option value="Letter">Letter</option>
                    <option value="A3">A3 Overview</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-500 font-medium uppercase">Orientation</label>
                  <select value={orientation} onChange={(e) => setOrientation(e.target.value as any)} className="w-full bg-zinc-950 border border-zinc-900 rounded-lg p-2 text-xs font-medium focus:outline-none">
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
                  <a href={lastZipUrl} download="paperless_captures.zip" className="h-8 px-4 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-bold tracking-tight transition flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download ZIP
                  </a>
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
