import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { production } from "@/services";
import { products as productService } from "@/services";
import type { Product } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/shared/SearchableSelect";
import { QuickCreateProductModal, type QuickCreateMode } from "@/components/production/QuickCreateProductModal";

/** Full-page recipe create — breadcrumb, metadata card, và bảng dòng NL giống phiếu điều chỉnh tồn kho. */
export default function ProductionRecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  const editId = id ? Number(id) : null;
  const isEditMode = Number.isFinite(editId);
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
  const [overheadCost, setOverheadCost] = useState("0");
  const [rows, setRows] = useState<
    Array<{ productId: string; variantId: string; qty: number; unit: string }>
  >([{ productId: "", variantId: "", qty: 1, unit: "u" }]);
  const [saving, setSaving] = useState(false);
  const [quickCreate, setQuickCreate] = useState<{ mode: QuickCreateMode; rowIdx: number | "output" } | null>(null);

  const refreshProducts = async () => {
    const pg = await productService.list({ pageSize: 500 });
    setProducts(pg.items);
    return pg.items;
  };

  useEffect(() => {
    void (async () => {
      try {
        const pg = await productService.list({ pageSize: 500 });
        setProducts(pg.items);
        if (isEditMode && editId != null) {
          const recipe = await production.getRecipe(editId);
          setCode(recipe.recipeCode ?? "");
          setName(recipe.name ?? "");
          setOutPid(String(recipe.outputProductId));
          setOutVid(String(recipe.outputVariantId));
          setOutQty(Number(recipe.outputQty) || 1);
          setMustSell(Boolean(recipe.outputMustBeSellable));
          setOverheadCost(String(recipe.overheadCost ?? 0));
          setRows(
            (recipe.components ?? []).map((r) => ({
              productId: String(r.productId),
              variantId: String(r.variantId),
              qty: Number(r.qtyPerOutput) || 1,
              unit: r.unit || "u",
            }))
          );
        }
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
  }, [editId, isEditMode]);

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
      if (isEditMode && editId != null) {
        await production.patchRecipe(editId, {
          name: name.trim(),
          outputMustBeSellable: mustSell,
          overheadCost: Number(overheadCost || "0"),
          active: true,
          components: lines,
        });
        toast.success("Đã cập nhật quy trình");
        navigate(`/admin/production/recipes/${editId}`);
      } else {
        await production.createRecipe({
          recipeCode: code.trim().toUpperCase(),
          name: name.trim(),
          outputProductId: Number(outPid),
          outputVariantId: Number(outVid),
          outputQty: outQty,
          outputMustBeSellable: mustSell,
          overheadCost: Number(overheadCost || "0"),
          components: lines,
        });
        toast.success("Đã lưu quy trình");
        navigate("/admin/production");
      }
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
        <span className="text-foreground font-medium">{isEditMode ? "Sửa quy trình" : "Tạo quy trình"}</span>
      </div>

      <PageHeader
        title={isEditMode ? "Sửa quy trình sản xuất" : "Tạo quy trình sản xuất"}
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
              {isEditMode ? "Cập nhật quy trình" : "Lưu quy trình"}
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
                  disabled={isEditMode}
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
                  {!isEditMode && (
                    <button
                      type="button"
                      onClick={() => setQuickCreate({ mode: "finished", rowIdx: "output" })}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      + Tạo thành phẩm
                    </button>
                  )}
                </div>
                <SearchableSelect
                  value={outPid}
                  onChange={(v) => {
                    setOutPid(v);
                    setOutVid("");
                  }}
                  disabled={isEditMode}
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
                  disabled={!outputProduct || isEditMode}
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
                  disabled={isEditMode}
                  className="mt-1 w-full sm:max-w-[12rem] h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Chi phí sản xuất bổ sung</label>
                <input
                  type="number"
                  min={0}
                  value={overheadCost}
                  onChange={(e) => setOverheadCost(e.target.value)}
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

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
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
                  {rows.map((row, idx) => {
                    const rowProduct = products.find((p) => String(p.id) === row.productId) ?? null;
                    const rowVariant = rowProduct?.variants.find((v) => String(v.id) === row.variantId) ?? null;
                    return (
                    <Fragment key={idx}>
                    <tr key={`${idx}-r`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums align-top">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <SearchableSelect
                            value={row.productId}
                            onChange={(v) => {
                              const next = [...rows];
                              next[idx] = { ...next[idx], productId: v, variantId: "" };
                              setRows(next);
                            }}
                            placeholder="Chọn nguyên liệu"
                            size="sm"
                            options={products.map((p) => ({
                              value: String(p.id),
                              label: p.code,
                              hint: p.name,
                              searchText: `${p.code} ${p.name}`,
                            }))}
                          />
                          <button
                            type="button"
                            onClick={() => setQuickCreate({ mode: "material", rowIdx: idx })}
                            className="shrink-0 inline-flex items-center gap-1 px-2 h-8 text-[11px] font-medium border rounded-md hover:bg-muted text-primary"
                            title="Tạo nguyên liệu nhanh"
                          >
                            <Plus className="h-3 w-3" /> Tạo
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          value={row.variantId}
                          onChange={(v) => {
                            const next = [...rows];
                            const variant = rowProduct?.variants.find((x) => String(x.id) === v);
                            next[idx] = {
                              ...next[idx],
                              variantId: v,
                              unit: (next[idx].unit === "u" || !next[idx].unit) && variant?.sellUnit ? variant.sellUnit : next[idx].unit,
                            };
                            setRows(next);
                          }}
                          disabled={!row.productId}
                          placeholder="Chọn PL"
                          size="sm"
                          options={(rowProduct?.variants ?? []).map((v) => ({
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
                      <td className="px-3 py-2 align-top">
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
                    {(rowVariant || !row.productId) && (
                      <tr key={`${idx}-m`} className="border-b last:border-0">
                        <td />
                        <td colSpan={5} className="px-3 pb-2 text-[11px] text-muted-foreground">
                          {!row.productId ? (
                            <span>Chọn nguyên liệu để tự điền đơn vị và xem tồn khả dụng.</span>
                          ) : rowVariant ? (
                            <span className="space-x-2">
                              <span>Đơn vị tồn kho: <b>{rowVariant.sellUnit}</b></span>
                              <span>· Đơn vị nhập: <b>{rowVariant.importUnit}</b></span>
                              <span>· Quy đổi: 1 {rowVariant.importUnit} = {rowVariant.piecesPerImportUnit} {rowVariant.sellUnit}</span>
                              <span>· Tồn khả dụng: <b>{rowVariant.stock}</b></span>
                              {rowVariant.expiryDate && <span>· HSD: {rowVariant.expiryDate}</span>}
                              {row.unit && row.unit !== rowVariant.sellUnit && (
                                <span className="text-warning">· Đơn vị đã được chỉnh riêng cho công thức này.</span>
                              )}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet: card list */}
            <div className="md:hidden space-y-3">
              {rows.map((row, idx) => {
                const rowProduct = products.find((p) => String(p.id) === row.productId) ?? null;
                const rowVariant = rowProduct?.variants.find((v) => String(v.id) === row.variantId) ?? null;
                return (
                  <div key={idx} className="rounded-lg border bg-card p-3 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Dòng #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                        className={cn(
                          "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-danger-soft text-muted-foreground hover:text-danger transition-colors",
                          rows.length <= 1 && "opacity-40 pointer-events-none"
                        )}
                        title="Xóa dòng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Sản phẩm</label>
                      <div className="mt-1 flex items-center gap-1">
                        <SearchableSelect
                          value={row.productId}
                          onChange={(v) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], productId: v, variantId: "" };
                            setRows(next);
                          }}
                          placeholder="Chọn nguyên liệu"
                          size="sm"
                          options={products.map((p) => ({
                            value: String(p.id),
                            label: p.code,
                            hint: p.name,
                            searchText: `${p.code} ${p.name}`,
                          }))}
                        />
                        <button
                          type="button"
                          onClick={() => setQuickCreate({ mode: "material", rowIdx: idx })}
                          className="shrink-0 inline-flex items-center gap-1 px-2 h-8 text-[11px] font-medium border rounded-md hover:bg-muted text-primary"
                          title="Tạo nguyên liệu nhanh"
                        >
                          <Plus className="h-3 w-3" /> Tạo
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Phân loại</label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={row.variantId}
                          onChange={(v) => {
                            const next = [...rows];
                            const variant = rowProduct?.variants.find((x) => String(x.id) === v);
                            next[idx] = {
                              ...next[idx],
                              variantId: v,
                              unit:
                                (next[idx].unit === "u" || !next[idx].unit) && variant?.sellUnit
                                  ? variant.sellUnit
                                  : next[idx].unit,
                            };
                            setRows(next);
                          }}
                          disabled={!row.productId}
                          placeholder="Chọn PL"
                          size="sm"
                          options={(rowProduct?.variants ?? []).map((v) => ({
                            value: String(v.id),
                            label: v.code,
                            hint: !v.isSellable ? "· NS" : v.name,
                            searchText: `${v.code} ${v.name}`,
                          }))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">SL / output</label>
                        <input
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], qty: Number(e.target.value) || 1 };
                            setRows(next);
                          }}
                          className="mt-1 w-full h-9 px-2 text-sm border rounded-md bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Đơn vị</label>
                        <input
                          value={row.unit}
                          onChange={(e) => {
                            const next = [...rows];
                            next[idx] = { ...next[idx], unit: e.target.value };
                            setRows(next);
                          }}
                          className="mt-1 w-full h-9 px-2 text-sm border rounded-md bg-background font-mono focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {!row.productId ? (
                        <span>Chọn nguyên liệu để tự điền đơn vị và xem tồn khả dụng.</span>
                      ) : rowVariant ? (
                        <span className="space-y-0.5 inline-block">
                          <span className="block">
                            Đơn vị tồn kho: <b>{rowVariant.sellUnit}</b> · Đơn vị nhập:{" "}
                            <b>{rowVariant.importUnit}</b>
                          </span>
                          <span className="block">
                            Quy đổi: 1 {rowVariant.importUnit} ={" "}
                            {rowVariant.piecesPerImportUnit} {rowVariant.sellUnit}
                          </span>
                          <span className="block">
                            Tồn khả dụng: <b>{rowVariant.stock}</b>
                            {rowVariant.expiryDate ? <> · HSD: {rowVariant.expiryDate}</> : null}
                          </span>
                          {row.unit && row.unit !== rowVariant.sellUnit && (
                            <span className="block text-warning">
                              · Đơn vị đã được chỉnh riêng cho công thức này.
                            </span>
                          )}
                        </span>
                      ) : null}
                    </p>
                  </div>
                );
              })}
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

      <QuickCreateProductModal
        open={!!quickCreate}
        mode={quickCreate?.mode ?? "material"}
        onClose={() => setQuickCreate(null)}
        onCreated={(p) => {
          void refreshProducts().then(() => {
            const variantId = p.variants[0]?.id ?? "";
            const sellUnit = p.variants[0]?.sellUnit ?? "u";
            if (!quickCreate) return;
            if (quickCreate.rowIdx === "output") {
              setOutPid(String(p.id));
              setOutVid(String(variantId));
            } else {
              const next = [...rows];
              const i = quickCreate.rowIdx;
              next[i] = { ...next[i], productId: String(p.id), variantId: String(variantId), unit: sellUnit };
              setRows(next);
            }
          });
        }}
      />
    </div>
  );
}
