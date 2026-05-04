/** Domain shapes for catalog/admin — backend-mapped, not Lovable mock payloads. */

export interface ProductVariant {
  id: string;
  code: string;
  name: string;
  sellUnit: string;
  importUnit: string;
  piecesPerImportUnit: number;
  sellPrice: number;
  costPrice: number;
  stock: number;
  minStock: number;
  expiryDays: number;
  isDefault: boolean;
  isSellable?: boolean;
  expiryDate?: string;
  image?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  image: string;
  images?: string[];
  active: boolean;
  variants: ProductVariant[];
  type: "single" | "multi";
}
