import type { InventoryService } from "@/services/inventory/InventoryService";
import type { Batch, ID, InventoryMovement, InventoryProjection } from "@/services/types";
import { getStoreState } from "@/lib/store";

/**
 * FE-skeleton local adapter. No batch model exists in the legacy mock store, so:
 *  - `getInventoryProjection` returns `onHand = variant.stock`, no batch breakdown.
 *  - `listBatches` returns [] (BE will fill real lots).
 *  - `listMovements` returns [] (no ledger persisted client-side).
 *
 * The UI can call these freely today; nothing breaks when the BE adapter
 * starts returning real data.
 */
export class LocalInventoryAdapter implements InventoryService {
  private oneFromCatalog(variantId: ID): InventoryProjection | null {
    const products = getStoreState().products;
    for (const p of products) {
      const v = p.variants.find((x) => x.id === variantId);
      if (v) {
        const stock = v.stock;
        return {
          variantId,
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          variantCode: v.code,
          variantName: v.name,
          sellUnit: v.sellUnit,
          onHand: stock,
          reserved: 0,
          available: stock,
        };
      }
    }
    return null;
  }

  async listInventoryProjections(): Promise<InventoryProjection[]> {
    const out: InventoryProjection[] = [];
    for (const p of getStoreState().products) {
      for (const v of p.variants) {
        const row = this.oneFromCatalog(v.id);
        if (row) out.push(row);
      }
    }
    return out;
  }

  async getInventoryProjection(variantId: ID): Promise<InventoryProjection | null> {
    return this.oneFromCatalog(variantId);
  }

  async getProjection(variantId: ID): Promise<InventoryProjection | null> {
    return this.getInventoryProjection(variantId);
  }

  async listBatches(_variantId: ID): Promise<Batch[]> {
    return [];
  }
  async listMovements(_filter: {
    variantId?: ID;
    sourceType?: InventoryMovement["sourceType"];
    sourceId?: ID;
  }): Promise<InventoryMovement[]> {
    return [];
  }
}
