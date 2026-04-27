// Downscale an image File to a max dimension and return a JPEG/PNG data URL.
// Used for wallet QR uploads so we don't blow past localStorage quota.

export interface ResizeOptions {
  maxDim?: number; // longest side in pixels
  mime?: "image/jpeg" | "image/png" | "image/webp";
  quality?: number; // 0..1 (only for jpeg/webp)
}

export async function resizeImageFile(
  file: File,
  opts: ResizeOptions = {}
): Promise<string> {
  const { maxDim = 768, mime = "image/png", quality = 0.92 } = opts;

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  // No need to re-encode if already small and original is png/jpeg
  if (scale === 1 && (file.type === mime || file.type === "image/png")) {
    return dataUrl;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  // Preserve transparency for PNG; fill white for JPEG.
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(mime, quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

export function approxDataUrlBytes(dataUrl: string): number {
  // base64 is ~4/3 of binary; subtract header.
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}
