// InventoryService — canonical interface for stock projection and movements.
// FE skeleton ONLY. Local adapter returns the legacy single-number `stock`
// from `ProductVariant` as `onHand`, and an empty movement list. Real batch
// allocation will arrive with the BE; UI slot is reserved.

import type {
  Batch,
  ID,
  InventoryMovement,
  InventoryProjection,
} from "@/services/types";

export interface InventoryService {
  /** All variant projections (backend `/api/inventory/projections` when authenticated). */
  listInventoryProjections(): Promise<InventoryProjection[]>;
  /** Canonical name for a single variant projection. */
  getInventoryProjection(variantId: ID): Promise<InventoryProjection | null>;
  /**
   * @deprecated Use `getInventoryProjection` — preserved for existing callers.
   * Current on-hand projection for a variant (derived from batches when BE is live). */
  getProjection(variantId: ID): Promise<InventoryProjection | null>;
  /** Active batches for a variant (FIFO/expiry order is BE-decided). */
  listBatches(variantId: ID): Promise<Batch[]>;
  /** Append-only movement ledger filtered by variant or source. */
  listMovements(filter: {
    variantId?: ID;
    sourceType?: InventoryMovement["sourceType"];
    sourceId?: ID;
  }): Promise<InventoryMovement[]>;
}
