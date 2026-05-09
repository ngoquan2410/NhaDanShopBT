import { adminFetchJson } from "@/services/auth/adminApi";
import type { PagedResult } from "@/services/types";
import type {
  CreateProductionOrderInput,
  CreateProductionRecipeInput,
  PatchProductionRecipeInput,
  ProductionAdminService,
  ProductionOrderDto,
  ProductionOrderListParams,
  ProductionOrderVoidInput,
  ProductionPreviewDto,
  ProductionRecipeDto,
  ProductionRecipeListParams,
} from "@/services/production/ProductionAdminService";

interface SpringPage<T> {
  content: T[];
  totalElements: number;
  number: number;
  size: number;
}

const API_R = "/api/production-recipes";
const API_O = "/api/production-orders";

export class BackendProductionAdminAdapter implements ProductionAdminService {
  async listRecipes(params?: ProductionRecipeListParams): Promise<PagedResult<ProductionRecipeDto>> {
    const q = new URLSearchParams();
    if (params?.archived != null) q.set("archived", String(params.archived));
    if (params?.active != null) q.set("active", String(params.active));
    if (params?.includeArchived != null) q.set("includeArchived", String(params.includeArchived));
    if (params?.outputVariantId != null) q.set("outputVariantId", String(params.outputVariantId));
    if (params?.query != null && params.query.trim()) q.set("query", params.query.trim());
    const page0 = Math.max(0, (params?.page ?? 1) - 1);
    q.set("page", String(page0));
    q.set("size", String(params?.pageSize ?? 20));
    const sort = params?.sort?.[0];
    if (sort?.field && sort.direction) {
      q.set("sort", `${sort.field},${sort.direction}`);
    } else {
      q.set("sort", "id,desc");
    }
    const url = `${API_R}?${q}`;
    const page = await adminFetchJson<SpringPage<ProductionRecipeDto>>(url);
    return {
      items: page.content ?? [],
      total: page.totalElements ?? 0,
      page: (page.number ?? 0) + 1,
      pageSize: page.size ?? 20,
    };
  }

  async getRecipe(id: number): Promise<ProductionRecipeDto> {
    return adminFetchJson<ProductionRecipeDto>(`${API_R}/${encodeURIComponent(String(id))}`);
  }

  async createRecipe(body: CreateProductionRecipeInput): Promise<ProductionRecipeDto> {
    return adminFetchJson<ProductionRecipeDto>(API_R, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async patchRecipe(id: number, body: PatchProductionRecipeInput): Promise<ProductionRecipeDto> {
    return adminFetchJson<ProductionRecipeDto>(`${API_R}/${encodeURIComponent(String(id))}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async archiveRecipe(id: number): Promise<ProductionRecipeDto> {
    return adminFetchJson<ProductionRecipeDto>(`${API_R}/${encodeURIComponent(String(id))}/archive`, {
      method: "POST",
    });
  }

  async previewOrder(body: {
    recipeId: number;
    outputQty: number;
    overheadCost?: string | number | null;
  }): Promise<ProductionPreviewDto> {
    return adminFetchJson<ProductionPreviewDto>(`${API_O}/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async createOrder(body: CreateProductionOrderInput): Promise<ProductionOrderDto> {
    return adminFetchJson<ProductionOrderDto>(API_O, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async listOrders(params?: ProductionOrderListParams): Promise<PagedResult<ProductionOrderDto>> {
    const q = new URLSearchParams();
    const status = params?.status?.trim();
    if (status) q.set("status", status);
    if (params?.recipeId != null) q.set("recipeId", String(params.recipeId));
    if (params?.outputVariantId != null) q.set("outputVariantId", String(params.outputVariantId));
    if (params?.query != null && params.query.trim()) q.set("query", params.query.trim());
    if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
    if (params?.dateTo) q.set("dateTo", params.dateTo);
    const page0 = Math.max(0, (params?.page ?? 1) - 1);
    q.set("page", String(page0));
    q.set("size", String(params?.pageSize ?? 20));
    const sort = params?.sort?.[0];
    if (sort?.field && sort.direction) {
      q.set("sort", `${sort.field},${sort.direction}`);
    } else {
      q.set("sort", "createdAt,desc");
    }
    const url = `${API_O}?${q}`;
    const page = await adminFetchJson<SpringPage<ProductionOrderDto>>(url);
    return {
      items: page.content ?? [],
      total: page.totalElements ?? 0,
      page: (page.number ?? 0) + 1,
      pageSize: page.size ?? 20,
    };
  }

  async getOrder(id: number): Promise<ProductionOrderDto> {
    return adminFetchJson<ProductionOrderDto>(`${API_O}/${encodeURIComponent(String(id))}`);
  }

  async voidOrder(id: number, body?: ProductionOrderVoidInput): Promise<ProductionOrderDto> {
    return adminFetchJson<ProductionOrderDto>(`${API_O}/${encodeURIComponent(String(id))}/void`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  }
}
