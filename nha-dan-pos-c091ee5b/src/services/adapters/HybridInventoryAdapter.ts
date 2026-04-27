import type { InventoryService } from "@/services/inventory/InventoryService";
import { getAdminSession } from "@/services/auth/adminApi";
import { LocalInventoryAdapter } from "@/services/adapters/local/LocalInventoryAdapter";
import { BackendInventoryAdapter } from "@/services/adapters/backend/BackendInventoryAdapter";
import { getStoreState } from "@/lib/store";
import type { Batch, ID, InventoryMovement, InventoryProjection } from "@/services/types";

/**
 * When an admin session exists, use backend inventory projections. Otherwise
 * (storefront, no login) fall back to local mock stock to avoid `adminFetchJson`
 * login prompts. On remote failure, single-variant `get` falls back to local;
 * `list` falls back to a scan of the mock catalog.
 */
export class HybridInventoryAdapter implements InventoryService {
  constructor(
    private readonly backend: BackendInventoryAdapter = new BackendInventoryAdapter(),
    private readonly local: LocalInventoryAdapter = new LocalInventoryAdapter(),
  ) {}

  private hasSession() {
    return Boolean(getAdminSession()?.accessToken);
  }

  async listInventoryProjections(): Promise<InventoryProjection[]> {
    if (this.hasSession()) {
      try {
        return await this.backend.listInventoryProjections();
      } catch {
        // fall through
      }
    }
    return this.listLocalAllProjections();
  }

  private async listLocalAllProjections(): Promise<InventoryProjection[]> {
    const out: InventoryProjection[] = [];
    for (const p of getStoreState().products) {
      for (const v of p.variants) {
        const one = await this.local.getInventoryProjection(v.id);
        if (one) out.push(one);
      }
    }
    return out;
  }

  async getInventoryProjection(variantId: ID): Promise<InventoryProjection | null> {
    if (this.hasSession()) {
      try {
        const p = await this.backend.getInventoryProjection(variantId);
        if (p) return p;
      } catch {
        /* use local */
      }
    }
    return this.local.getInventoryProjection(variantId);
  }

  async getProjection(variantId: ID): Promise<InventoryProjection | null> {
    return this.getInventoryProjection(variantId);
  }

  async listBatches(variantId: ID): Promise<Batch[]> {
    return this.local.listBatches(variantId);
  }

  async listMovements(filter: {
    variantId?: ID;
    sourceType?: InventoryMovement["sourceType"];
    sourceId?: ID;
  }): Promise<InventoryMovement[]> {
    return this.local.listMovements(filter);
  }
}
