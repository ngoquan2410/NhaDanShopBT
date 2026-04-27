import { toast } from "sonner";

export type PrintMode = "a4" | "pos58" | "pos80";

interface TriggerPrintOptions {
  targetId: string;
}

let activePrintJobId: string | null = null;
let activeCleanup: (() => void) | null = null;

function buildPrintStyles(mode: PrintMode) {
  if (mode === "a4") {
    return `
      @page { size: A4 portrait; margin: 12mm; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }
      body {
        font-family: Arial, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #print-mount,
      #print-mount > * {
        display: block !important;
        position: static !important;
        left: auto !important;
        top: auto !important;
        width: auto !important;
        max-width: none !important;
        visibility: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        box-shadow: none !important;
      }
    `;
  }

  // Use the printer's safe printable width as the @page width so browser
  // does not scale content into an area larger than the print head can print.
  // POS58: tightened to 44mm to absolutely guarantee the right edge never clips
  // on real thermal printers (mechanical printable area is often <48mm).
  const paperWidth = mode === "pos58" ? "44mm" : "72mm";
  return `
    @page { size: ${paperWidth} auto; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${paperWidth} !important;
      max-width: ${paperWidth} !important;
      background: #fff !important;
      color: #000 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
    body {
      font-family: Arial, Helvetica, system-ui, sans-serif;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #print-mount, #print-mount * {
      color: #000 !important;
      font-weight-adjust: none;
    }
    #print-mount,
    #print-mount > * {
      display: block !important;
      position: static !important;
      left: auto !important;
      top: auto !important;
      width: ${paperWidth} !important;
      max-width: ${paperWidth} !important;
      min-height: 0 !important;
      height: auto !important;
      visibility: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      box-shadow: none !important;
      background: #fff !important;
    }
    #print-mount [data-thermal-root] * {
      position: static !important;
      float: none !important;
      box-sizing: border-box !important;
      max-height: none !important;
    }
  `;
}

function createPrintFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);
  return frame;
}

export function triggerPrint(label: string, mode: PrintMode = "a4", options: TriggerPrintOptions) {
  const source = document.getElementById(options.targetId);
  if (!source) {
    toast.error("Không tìm thấy nội dung in");
    return false;
  }

  if (activePrintJobId) {
    toast.error("Đang có lệnh in khác, vui lòng chờ hoàn tất");
    return false;
  }

  const toastId = toast.loading(`Đang chuẩn bị in ${label}...`);
  const frame = createPrintFrame();
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  activePrintJobId = jobId;

  let cleaned = false;
  let focusFallbackAttached = false;
  let cleanupTimer = 0;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (cleanupTimer) window.clearTimeout(cleanupTimer);
    if (focusFallbackAttached) window.removeEventListener("focus", onFocusBack);
    toast.dismiss(toastId);
    frame.remove();
    if (activePrintJobId === jobId) activePrintJobId = null;
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  const onFocusBack = () => {
    window.setTimeout(cleanup, 300);
  };

  activeCleanup = cleanup;

  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Không khởi tạo được khung in");

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${label}</title><style>${buildPrintStyles(mode)}</style></head><body><div id="print-mount"></div></body></html>`);
    doc.close();

    const mount = doc.getElementById("print-mount");
    if (!mount) throw new Error("Không tạo được vùng in");

    const clone = source.cloneNode(true) as HTMLElement;
    mount.appendChild(clone);

    win.addEventListener("afterprint", cleanup, { once: true });
    focusFallbackAttached = true;
    window.addEventListener("focus", onFocusBack, { once: true });
    cleanupTimer = window.setTimeout(cleanup, 20000);

    window.setTimeout(() => {
      try {
        if (activePrintJobId !== jobId) return;
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 120);

    return true;
  } catch {
    cleanup();
    toast.error("Không thể mở lệnh in");
    return false;
  }
}

export function cancelActivePrintJob() {
  activeCleanup?.();
}
