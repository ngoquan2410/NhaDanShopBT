import type {
  CreateGoodsReceiptInput,
  GoodsReceiptListParams,
  GoodsReceiptService,
} from "@/services/goodsReceipts/GoodsReceiptService";
import { getAdminSession } from "@/services/auth/adminApi";
import { LocalGoodsReceiptAdapter } from "@/services/adapters/local/LocalGoodsReceiptAdapter";
import { BackendGoodsReceiptAdapter } from "@/services/adapters/backend/BackendGoodsReceiptAdapter";
import type { GoodsReceipt, GoodsReceiptLine, ID, PagedResult } from "@/services/types";

/**
 * When an admin session exists, use backend goods receipts. Otherwise fall back
 * to local mock data (avoids admin login prompts for storefront or logged-out
 * local preview), mirroring {@link HybridInventoryAdapter}.
 */
export class HybridGoodsReceiptAdapter implements GoodsReceiptService {
  constructor(
    private readonly backend: BackendGoodsReceiptAdapter = new BackendGoodsReceiptAdapter(),
    private readonly local: LocalGoodsReceiptAdapter = new LocalGoodsReceiptAdapter(),
  ) {}

  private hasSession() {
    return Boolean(getAdminSession()?.accessToken);
  }

  async list(params?: GoodsReceiptListParams): Promise<PagedResult<GoodsReceipt>> {
    if (this.hasSession()) {
      try {
        return await this.backend.list(params);
      } catch {
        // fall back
      }
    }
    return this.local.list(params);
  }

  async get(id: ID): Promise<GoodsReceipt | null> {
    if (this.hasSession()) {
      try {
        return await this.backend.get(id);
      } catch {
        /* */
      }
    }
    return this.local.get(id);
  }

  async getLines(id: ID): Promise<GoodsReceiptLine[]> {
    if (this.hasSession()) {
      try {
        return await this.backend.getLines(id);
      } catch {
        /* */
      }
    }
    return this.local.getLines(id);
  }

  async createDraft(input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
    return this.local.createDraft(input);
  }

  async confirm(id: ID): Promise<GoodsReceipt> {
    return this.local.confirm(id);
  }

  async remove(id: ID): Promise<void> {
    if (this.hasSession()) {
      try {
        return await this.backend.remove(id);
      } catch (e) {
        throw e;
      }
    }
    return this.local.remove(id);
  }
}
