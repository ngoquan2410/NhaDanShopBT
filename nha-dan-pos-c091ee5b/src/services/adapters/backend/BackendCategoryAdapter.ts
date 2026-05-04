import { adminFetchJson } from "@/services/auth/adminApi";
import type {
  CategoryListParams,
  CategoryService,
  CreateCategoryInput,
} from "@/services/categories/CategoryService";
import type { PagedResult } from "@/services/types";
import type { Category } from "@/lib/mock-data";

const API = "/api/categories";

type SpringPageLike<T> = { content?: T[] };

function normalizeCategoryPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object" && "content" in payload) {
    const c = (payload as SpringPageLike<Record<string, unknown>>).content;
    return Array.isArray(c) ? c : [];
  }
  return [];
}

function mapCategory(raw: Record<string, unknown>): Category {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    description: typeof raw.description === "string" ? raw.description : "",
    active: raw.active !== false,
    productCount: typeof raw.productCount === "number" ? raw.productCount : 0,
  };
}

export class BackendCategoryAdapter implements CategoryService {
  async list(params?: CategoryListParams): Promise<PagedResult<Category>> {
    const q = new URLSearchParams();
    if (params?.includeInactive) q.set("includeInactive", "true");
    const url = q.toString() ? `${API}?${q}` : API;
    const payload = await adminFetchJson<unknown>(url);
    const list = normalizeCategoryPayload(payload).map(mapCategory);
    const filtered = list.filter((c) => {
      if (params?.active === undefined) return true;
      return Boolean(c.active) === params.active;
    });
    return {
      items: filtered,
      total: filtered.length,
      page: 1,
      pageSize: Math.max(filtered.length, 1),
    };
  }

  async get(id: string): Promise<Category | null> {
    try {
      return mapCategory(
        (await adminFetchJson<Record<string, unknown>>(
          `${API}/${encodeURIComponent(id)}`,
        )) as Record<string, unknown>,
      );
    } catch {
      return null;
    }
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    return mapCategory(
      (await adminFetchJson<Record<string, unknown>>(API, {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          active: true,
        }),
      })) as Record<string, unknown>,
    );
  }

  async update(id: string, patch: Partial<Category>): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    const body: Record<string, unknown> = {};
    if (patch.name != null) body.name = patch.name;
    if (patch.description != null) body.description = patch.description;
    if (patch.active != null) body.active = patch.active;
    if (Object.keys(body).length === 0) return;
    await adminFetchJson(`${API}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async toggleActive(_id: string): Promise<void> {
    // Backend has no dedicated toggle; use get + patch if needed by UI later.
  }

  async remove(id: string): Promise<void> {
    await adminFetchJson(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
