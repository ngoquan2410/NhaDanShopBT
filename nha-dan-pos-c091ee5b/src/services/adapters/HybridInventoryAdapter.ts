import type { InventoryService } from "@/services/inventory/InventoryService";
import { BackendInventoryAdapter } from "@/services/adapters/backend/BackendInventoryAdapter";
import type { Batch, ID, InventoryMovement, InventoryProjection } from "@/services/types";

/**
 * Production inventory adapter. No local mock fallback is allowed for active
 * admin inventory/reporting screens.
 */
export class HybridInventoryAdapter implements InventoryService {
  constructor(
    private readonly backend: BackendInventoryAdapter = new BackendInventoryAdapter(),
  ) {}

  async listInventoryProjections(): Promise<InventoryProjection[]> {
    return this.backend.listInventoryProjections();
  }

  async getInventoryProjection(variantId: ID): Promise<InventoryProjection | null> {
    return this.backend.getInventoryProjection(variantId);
  }

  async getProjection(variantId: ID): Promise<InventoryProjection | null> {
    return this.getInventoryProjection(variantId);
  }

  async listBatches(variantId: ID): Promise<Batch[]> {
    const projection = await this.backend.getInventoryProjection(variantId);
    return (projection?.byBatch ?? []).map((batch) => ({
      id: batch.batchId,
      variantId,
      lotCode: batch.lotCode ?? batch.batchCode ?? batch.batchId,
      qty: batch.qty,
      costPrice: batch.costPrice ?? 0,
      expiryDate: batch.expiryDate,
      receiptId: batch.receiptId,
      createdAt: batch.createdAt,
    }));
  }

  async listMovements(filter: {
    variantId?: ID;
    sourceType?: InventoryMovement["sourceType"];
    sourceId?: ID;
  }): Promise<InventoryMovement[]> {
    return [];
  }
}
