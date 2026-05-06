import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { production } from "@/services";
import { products as productService } from "@/services";
import type { Product } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/shared/SearchableSelect";

/** Full-page recipe create — breadcrumb, metadata card, và bảng dòng NL giống phiếu điều chỉnh tồn kho. */
export default function ProductionRecipeFormPage() {
  const navigate = useNavigate();
  const errToastAt = useRef(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [outPid, setOutPid] = useState<string>("");
  const [outVid, setOutVid] = useState<string>("");
  const [outQty, setOutQty] = useState(10);
  const [mustSell, setMustSell] = useState(true);
  const [rows, setRows] = useState<
    Array<{ productId: string; variantId: string; qty: number; unit: string }>
  >([{ productId: "", variantId: "", qty: 1, unit: "u" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const pg = await productService.list({ pageSize: 500 });
        setProducts(pg.items);
      } catch {
        const now = Date.now();
        if (now - errToastAt.current > 6000) {
          errToastAt.current = now;
          toast.error("Không tải danh sách sản phẩm");
        }
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, []);

  const outputProduct = useMemo(
    () => products.find((p) => p.id === outPid) ?? null,
    [products, outPid],
  );

  const variantsFor = (pid: string) =>
    products.find((p) => p.id === pid)?.variants ?? [];

  const submit = async () => {
    if (!code.trim() || !name.trim() || !outPid || !outVid) {
      toast.error("Thiếu mã/tên/output");
      return;
    }
    const lines = rows
      .filter((r) => r.productId && r.variantId && r.qty > 0)
      .map((r, i) => ({
        productId: Number(r.productId),
        variantId: Number(r.variantId),
        qtyPerOutput: r.qty,
        unit: r.unit || "u",
        sortOrder: i,
      }));
    if (lines.length === 0) {
      toast.error("Cần ít nhất 1 nguyên liệu");
      return;
    }
    setSaving(true);
    try {
      await production.createRecipe({
        recipeCode: code.trim().toUpperCase(),
        name: name.trim(),
        outputProductId: Number(outPid),
        outputVariantId: Number(outVid),
        outputQty: outQty,
        outputMustBeSellable: mustSell,
        overheadCost: 0,
        components: lines,
      });
      toast.success("Đã lưu quy trình");
      navigate("/admin/production");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Không thể lưu quy trình — kiểm tra mã trùng hoặc dữ liệu.";
      const now = Date.now();
      if (now - errToastAt.current > 4000) {
        errToastAt.current = now;
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-dense space-y-4 pb-24 lg:pb-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/production" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Sản xuất
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Tạo quy trình</span>
      </div>

      <PageHeader
        title="Tạo quy trình sản xuất"
        description="Định nghĩa thành phẩm output và nguyên liệu tiêu hao trên mỗi đơn vị output."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void navigate("/admin/production")}
              className="inline-flex items-center px-3 h-9 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saving || loadingProducts}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu quy trình
            </button>
          </div>
        }
      />

      <div className="flex items-start gap-2 p-3 bg-info-soft rounded-lg border border-info/20 text-sm text-info">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Recipe chỉ lưu cấu trúc BOM; chạy lệnh sản xuất và trừ kho thực hiện tại tab{" "}
          <strong>Preview / tạo lệnh</strong> sau khi lưu.
        </span>
      </div>

      {loadingProducts ? (
        <p className="text-sm text-muted-foreground">Đang tải sản phẩm...</p>
      ) : (
        <>
          {/* Metadata card */}
          <div className="bg-card rounded-lg border p-4 sm:p-5">
            <h3 className="font-semibold text-sm mb-4">Thông tin quy trình</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mã quy trình *</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="VD: RCP-BANH-01"
                  className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tên *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Đóng gói bánh tráng"
                  className="mt-1 w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Sản phẩm thành phẩm *</label>
                  <Link
                    to="/admin/products"
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    + Tạo sản phẩm mới
                  </Link>
                </div>
                <SearchableSelect
                  value={outPid}
                  onChange={(v) => {
                    setOutPid(v);
                    setOutVid("");
                  }}
                  placeholder="Chọn sản phẩm"
                  className="mt-1"
                  options={products.map((p) => ({
                    value: String(p.id),
                    label: `${p.code} — ${p.name}`,
                    searchText: `${p.code} ${p.name}`,
                  }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phân loại output *</label>
                <SearchableSelect
                  value={outVid}
                  onChange={(v) => setOutVid(v)}
                  disabled={!outputProduct}
                  placeholder="Chọn phân loại"
                  className="mt-1"
                  options={(outputProduct?.variants ?? []).map((v) => ({
                    value: String(v.id),
                    label: `${v.code} — ${v.name}`,
                    hint: !v.isSellable ? "(không bán)" : undefined,
                    searchText: `${v.code} ${v.name}`,
                  }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">SL chuẩn output / recipe</label>
                <input
                  type="number"
                  min={1}
                  value={outQty}
                  onChange={(e) => setOutQty(Number(e.target.value) || 1)}
                  className="mt-1 w-full sm:max-w-[12rem] h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer rounded-md border bg-muted/30 px-3 py-2 w-full hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={mustSell}
                    onChange={(e) => setMustSell(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Thành phẩm phải bán được ở POS / gian hàng
                </label>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-card rounded-lg border overflow-hidden">
            <div className="flex items-center justify-between gap-2 p-4 border-b">
              <div>
                <p className="text-sm font-semibold">Nguyên liệu</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hệ số tiêu hao cho mỗi đơn vị output của recipe (không phải cho cả lô SX).
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRows([...rows, { productId: "", variantId: "", qty: 1, unit: "u" }])
                }
                className="inline-flex items-center gap-1 px-3 h-8 text-xs font-medium border rounded-md hover:bg-muted shrink-0 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm dòng
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-10">#</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[200px]">
                      Sản phẩm
                    </th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[180px]">
                      Phân loại
                    </th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-[110px]">
                      SL / output
                    </th>
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-[80px]">
                      Đ.vị
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={row.productId}
                          onChange={(v) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], productId: v, variantId: "" };
                            setRows(next);
                          }}
                          placeholder="Chọn SP"
                          size="sm"
                          options={products.map((p) => ({
                            value: String(p.id),
                            label: p.code,
                            hint: p.name,
                            searchText: `${p.code} ${p.name}`,
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={row.variantId}
                          onChange={(v) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], variantId: v };
                            setRows(next);
                          }}
                          disabled={!row.productId}
                          placeholder="Chọn PL"
                          size="sm"
                          options={variantsFor(row.productId).map((v) => ({
                            value: String(v.id),
                            label: v.code,
                            hint: !v.isSellable ? "· NS" : v.name,
                            searchText: `${v.code} ${v.name}`,
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], qty: Number(e.target.value) || 1 };
                            setRows(next);
                          }}
                          className="w-20 h-9 text-center text-xs border rounded-md bg-background mx-auto focus:outline-none focus:ring-2 focus:ring-ring/40 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          value={row.unit}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], unit: e.target.value };
                            setRows(next);
                          }}
                          className="w-16 h-9 text-center text-xs border rounded-md bg-background mx-auto font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                          className={cn(
                            "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-danger-soft text-muted-foreground hover:text-danger transition-colors",
                            rows.length <= 1 && "opacity-40 pointer-events-none",
                          )}
                          title="Xóa dòng"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-3 bg-card border-t lg:hidden z-30 flex gap-2 shadow-lg">
            <button
              type="button"
              onClick={() => void navigate("/admin/production")}
              className="flex-1 h-10 text-sm font-medium border rounded-md hover:bg-muted"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="flex-1 flex items-center justify-center gap-2 h-10 text-sm font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu
            </button>
          </div>
        </>
      )}
    </div>
  );
}
