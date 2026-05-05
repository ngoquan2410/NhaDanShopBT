import type {
  CreateGoodsReceiptInput,
  GoodsReceiptListParams,
  GoodsReceiptService,
} from "@/services/goodsReceipts/GoodsReceiptService";
import { BackendGoodsReceiptAdapter } from "@/services/adapters/backend/BackendGoodsReceiptAdapter";
import type { GoodsReceipt, GoodsReceiptLine, ID, PagedResult } from "@/services/types";

/**
 * Production goods receipt adapter. Backend is the only active admin source of
 * truth; draft/confirm are intentionally unsupported by the backend model.
 */
export class HybridGoodsReceiptAdapter implements GoodsReceiptService {
  constructor(
    private readonly backend: BackendGoodsReceiptAdapter = new BackendGoodsReceiptAdapter(),
  ) {}

  async list(params?: GoodsReceiptListParams): Promise<PagedResult<GoodsReceipt>> {
    return this.backend.list(params);
  }

  async get(id: ID): Promise<GoodsReceipt | null> {
    return this.backend.get(id);
  }

  async getLines(id: ID): Promise<GoodsReceiptLine[]> {
    return this.backend.getLines(id);
  }

  async createDraft(input: CreateGoodsReceiptInput): Promise<GoodsReceipt> {
    return this.backend.createDraft(input);
  }

  async confirm(id: ID): Promise<GoodsReceipt> {
    return this.backend.confirm(id);
  }

  async remove(id: ID): Promise<void> {
    return this.backend.remove(id);
  }

  async voidReceipt(id: ID, body?: { reason?: string; voidedBy?: string }): Promise<GoodsReceipt> {
    return this.backend.voidReceipt(id, body);
  }
}
