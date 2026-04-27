import { adminFetchJson } from "@/services/auth/adminApi";
import type { InventoryService } from "@/services/inventory/InventoryService";
import { normalizeInventoryProjection } from "@/services/inventory/inventoryProjectionNormalize";
import type { Batch, ID, InventoryMovement, InventoryProjection } from "@/services/types";

const API = "/api/inventory/projections";

/**
 * Read-only: maps backend `InventoryProjectionService` to the FE contract.
 * Requires admin JWT (see SecurityConfig: GET `/api/inventory/**` authenticated).
 */
export class BackendInventoryAdapter implements InventoryService {
  async listInventoryProjections(): Promise<InventoryProjection[]> {
    const rows = await adminFetchJson<Record<string, unknown>[]>(API);
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => normalizeInventoryProjection(r as Parameters<typeof normalizeInventoryProjection>[0]));
  }

  async getInventoryProjection(variantId: ID): Promise<InventoryProjection | null> {
    const raw = await adminFetchJson<Record<string, unknown>>(
      `${API}/${encodeURIComponent(String(variantId))}`,
    );
    if (!raw || typeof raw !== "object") return null;
    return normalizeInventoryProjection(raw as Parameters<typeof normalizeInventoryProjection>[0]);
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
