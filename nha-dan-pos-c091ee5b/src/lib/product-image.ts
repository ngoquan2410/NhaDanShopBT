import type { Product, ProductVariant } from "./mock-data";

/**
 * Source-of-truth resolver:
 *  - if a variant override exists -> use it
 *  - else fall back to product.image
 *  - else empty string (consumer renders placeholder)
 */
export function resolveProductImage(product: Pick<Product, "image" | "images">, variant?: Pick<ProductVariant, "image"> | null): string {
  if (variant?.image && variant.image.trim()) return variant.image;
  if (product.image && product.image.trim()) return product.image;
  if (product.images && product.images.length > 0) return product.images[0];
  return "";
}

/** Read a File as a base64 data URL (used by upload UI). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
