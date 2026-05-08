import type { ListQuery } from "@/services/types";

/** Mirror of backend Slice 6 DTO records (camelCase JSON). */

export interface ProductionRecipeComponentDto {
  id?: number | null;
  productId: number;
  variantId: number;
  qtyPerOutput: number;
  unit: string;
  sortOrder?: number | null;
  sellUnit?: string | null;
  importUnit?: string | null;
  piecesPerImportUnit?: number | null;
  availableQty?: number | null;
  nearestExpiryDateIso?: string | null;
}

export interface ProductionRecipeDto {
  id: number;
  recipeCode: string;
  name: string;
  outputProductId: number;
  outputVariantId: number;
  outputQty: number;
  outputMustBeSellable: boolean;
  overheadCost: string | number;
  active: boolean;
  archived: boolean;
  components: ProductionRecipeComponentDto[];
  updatedAtIso?: string | null;
}

export interface CreateProductionRecipeInput {
  recipeCode: string;
  name: string;
  outputProductId: number;
  outputVariantId: number;
  outputQty: number;
  outputMustBeSellable?: boolean;
  overheadCost?: string | number;
  components: Array<{
    productId: number;
    variantId: number;
    qtyPerOutput: number;
    unit: string;
    sortOrder?: number | null;
  }>;
}

export interface PatchProductionRecipeInput {
  name?: string | null;
  outputMustBeSellable?: boolean | null;
  overheadCost?: string | number | null;
  active?: boolean | null;
  components?: CreateProductionRecipeInput["components"];
}

export interface ProductionPreviewAllocationDto {
  batchId: number;
  lotCode: string;
  qty: number;
  unitCost: string | number;
  expiryDateIso?: string | null;
}

export interface ProductionPreviewComponentDto {
  productId: number;
  variantId: number;
  productName?: string;
  variantName?: string;
  variantCode?: string;
  requiredQty: number;
  availableQty: number;
  missingQty?: number;
  unit: string;
  allocations: ProductionPreviewAllocationDto[];
}

export interface ProductionShortageDetailDto {
  productId: number;
  variantId: number;
  productName?: string;
  variantName?: string;
  variantCode?: string;
  requiredQty: number;
  availableQty: number;
  missingQty: number;
  unit: string;
}

export interface ProductionPreviewDto {
  recipeId: number;
  outputQty: number;
  outputMustBeSellable: boolean;
  overheadCost: string | number;
  estimatedConsumedCost: string | number;
  estimatedOutputUnitCost: string | number;
  expectedOutputExpiryDateIso: string;
  maxProducibleQty: number;
  components: ProductionPreviewComponentDto[];
}

export interface CreateProductionOrderInput {
  recipeId: number;
  outputQty: number;
  overheadCost?: string | number | null;
  note?: string | null;
}

export interface ProductionOrderVoidInput {
  reason?: string | null;
  voidedBy?: string | null;
}

export interface ProductionAllocationResponse {
  id: number;
  batchId: number;
  lotCode?: string | null;
  qty: number;
  unitCost: string | number;
  totalCost?: string | number | null;
  allocationIndex?: number | null;
  expiryDateIso?: string | null;
}

export interface ProductionOrderComponentResponse {
  id: number;
  productId: number;
  variantId: number;
  productName?: string | null;
  variantName?: string | null;
  variantCode?: string | null;
  requiredQty: number;
  consumedQty: number;
  unit: string;
  allocations: ProductionAllocationResponse[];
}

export interface ProductionMovementDto {
  sourceType: string;
  variantId: number;
  batchId?: number | null;
  qtyDelta: number;
  sourceId: string;
  createdAtIso?: string | null;
}

export interface ProductionOrderDto {
  id: number;
  orderNo: string;
  status: string;
  recipeId?: number | null;
  recipeSnapshotJson: string;
  outputProductId: number;
  outputVariantId: number;
  outputQty: number;
  outputMustBeSellable: boolean;
  overheadCost: string | number;
  outputBatchId?: number | null;
  outputBatchCode?: string | null;
  outputUnitCost: string | number;
  outputExpiryDateIso?: string | null;
  components: ProductionOrderComponentResponse[];
  movements: ProductionMovementDto[];
  createdAtIso?: string | null;
  note?: string | null;
  voidedAtIso?: string | null;
  voidReason?: string | null;
}

export interface ProductionRecipeListParams extends ListQuery {
  archived?: boolean;
  active?: boolean;
  /** When true, include archived and non-archived recipes (optional admin view). */
  includeArchived?: boolean;
  outputVariantId?: number;
  /** Case-insensitive partial match on recipe code or name. */
  query?: string;
}

export interface ProductionOrderListParams extends ListQuery {
  status?: string;
  recipeId?: number;
  outputVariantId?: number;
  query?: string;
  /** ISO yyyy-MM-dd */
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductionAdminService {
  listRecipes(params?: ProductionRecipeListParams): Promise<import("@/services/types").PagedResult<ProductionRecipeDto>>;
  getRecipe(id: number): Promise<ProductionRecipeDto>;
  createRecipe(body: CreateProductionRecipeInput): Promise<ProductionRecipeDto>;
  patchRecipe(id: number, body: PatchProductionRecipeInput): Promise<ProductionRecipeDto>;
  archiveRecipe(id: number): Promise<ProductionRecipeDto>;

  previewOrder(body: { recipeId: number; outputQty: number; overheadCost?: string | number | null }): Promise<ProductionPreviewDto>;
  createOrder(body: CreateProductionOrderInput): Promise<ProductionOrderDto>;
  listOrders(params?: ProductionOrderListParams): Promise<import("@/services/types").PagedResult<ProductionOrderDto>>;
  getOrder(id: number): Promise<ProductionOrderDto>;
  voidOrder(id: number, body?: ProductionOrderVoidInput): Promise<ProductionOrderDto>;
}
