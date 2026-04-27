// Lightweight client-side heuristics to reject obviously-not-a-QR images
// (too small, nearly blank/uniform). Returns a problem message or null.
//
// Heuristic basis:
//  - QR codes are square-ish and need a minimum resolution to be readable.
//  - A real QR has high contrast: lots of near-black AND near-white pixels.
//  - A blank/photo-of-a-wall image will have one dominant color band.

export interface QrCheckOptions {
  minDim?: number; // minimum longest side, px
  minContrastRatio?: number; // min fraction of pixels that are dark+light
  minDarkRatio?: number; // QR usually >=15% dark modules
}

export interface QrCheckResult {
  ok: boolean;
  reason?: string;
  width: number;
  height: number;
  darkRatio: number;
  lightRatio: number;
}

export async function inspectQrImageFile(
  file: File,
  opts: QrCheckOptions = {}
): Promise<QrCheckResult> {
  const { minDim = 200, minContrastRatio = 0.5, minDarkRatio = 0.08 } = opts;

  const img = await loadImageFromFile(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  if (Math.max(w, h) < minDim) {
    return {
      ok: false,
      reason: `Ảnh quá nhỏ (${w}×${h}). Cần ít nhất ${minDim}px cạnh dài.`,
      width: w,
      height: h,
      darkRatio: 0,
      lightRatio: 0,
    };
  }

  // Sample at most 256x256 for speed.
  const sampleDim = 256;
  const scale = Math.min(1, sampleDim / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { ok: true, width: w, height: h, darkRatio: 0, lightRatio: 0 };
  }
  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let dark = 0;
  let light = 0;
  const total = sw * sh;
  for (let i = 0; i < data.length; i += 4) {
    // Rec.601 luma
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (y < 70) dark++;
    else if (y > 200) light++;
  }
  const darkRatio = dark / total;
  const lightRatio = light / total;
  const contrastRatio = darkRatio + lightRatio;

  if (darkRatio < minDarkRatio) {
    return {
      ok: false,
      reason: "Ảnh có quá ít vùng tối — không giống mã QR. Vui lòng kiểm tra lại.",
      width: w,
      height: h,
      darkRatio,
      lightRatio,
    };
  }
  if (contrastRatio < minContrastRatio) {
    return {
      ok: false,
      reason: "Ảnh có vẻ mờ hoặc thiếu tương phản. Hãy chụp/lưu ảnh QR rõ nét hơn.",
      width: w,
      height: h,
      darkRatio,
      lightRatio,
    };
  }
  return { ok: true, width: w, height: h, darkRatio, lightRatio };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
