import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { DateInput } from "@/components/shared/DateInput";
import {
  type Promotion,
  type PromotionType,
  PROMOTION_TYPE_LABELS,
  makeEmptyPromotion,
  validatePromotion,
  formatPromotionSummary,
} from "@/lib/promotions";
import { PercentForm, FixedForm, BuyXGetYForm, GiftForm, FreeShippingForm } from "./PromotionSubForms";
import { MultiPicker } from "./MultiPicker";

interface Props {
  promo: Promotion;
  onClose: () => void;
  onSave: (p: Promotion) => void;
}

export function PromotionFormShell({ promo, onClose, onSave }: Props) {
  const [form, setForm] = useState<Promotion>(promo);
  const { categories, products } = useStore();
  const isEdit = !!promo.id;

  const validation = useMemo(() => validatePromotion(form), [form]);
  const hasErrors = Object.keys(validation.errors).length > 0;
  const summary = useMemo(() => formatPromotionSummary(form), [form]);

  const setBase = <K extends keyof Promotion>(key: K, val: Promotion[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }) as Promotion);

  // Only discount-based types use a generic scope selector.
  // Rule-based types (buy-x-get-y, gift, free-shipping) derive scope from their own structure.
  const supportsScope = (t: PromotionType) => t === "percent" || t === "fixed";

  const switchType = (type: PromotionType) => {
    if (type === form.type) return;
    const fresh = makeEmptyPromotion(type);
    // Preserve shared fields. Reset scope to "all" when switching to rule-based types
    // to avoid leaking irrelevant scope selections into types that don't use them.
    const nextScope = supportsScope(type) ? form.scope : ({ kind: "all" } as const);
    setForm({
      ...fresh,
      id: form.id,
      name: form.name,
      description: form.description,
      active: form.active,
      startDate: form.startDate,
      endDate: form.endDate,
      scope: nextScope,
    });
  };

  const setScopeKind = (kind: "all" | "categories" | "products") => {
    if (kind === "all") setForm((p) => ({ ...p, scope: { kind: "all" } }));
    else if (kind === "categories") setForm((p) => ({ ...p, scope: { kind: "categories", categoryIds: [] } }));
    else setForm((p) => ({ ...p, scope: { kind: "products", productIds: [] } }));
  };

  const toggleScopeId = (id: string) => {
    setForm((p) => {
      if (p.scope.kind === "categories") {
        const ids = p.scope.categoryIds.includes(id) ? p.scope.categoryIds.filter((x) => x !== id) : [...p.scope.categoryIds, id];
        return { ...p, scope: { kind: "categories", categoryIds: ids } };
      }
      if (p.scope.kind === "products") {
        const ids = p.scope.productIds.includes(id) ? p.scope.productIds.filter((x) => x !== id) : [...p.scope.productIds, id];
        return { ...p, scope: { kind: "products", productIds: ids } };
      }
      return p;
    });
  };

  const clearScopeIds = () => {
    setForm((p) => {
      if (p.scope.kind === "categories") return { ...p, scope: { kind: "categories", categoryIds: [] } };
      if (p.scope.kind === "products") return { ...p, scope: { kind: "products", productIds: [] } };
      return p;
    });
  };

  const e = validation.errors;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">{isEdit ? "Sửa khuyến mãi" : "Tạo khuyến mãi"}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{PROMOTION_TYPE_LABELS[form.type]}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Section 1: General */}
          <Section title="Thông tin chung">
            <Field label="Tên khuyến mãi" error={e.name} required>
              <input value={form.name} onChange={(ev) => setBase("name", ev.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="VD: Khuyến mãi cuối tuần" />
            </Field>
            <Field label="Mô tả">
              <textarea value={form.description} onChange={(ev) => setBase("description", ev.target.value)} rows={2}
                className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Mô tả ngắn gọn..." />
            </Field>
          </Section>

          {/* Section 2: Type */}
          <Section title="Loại khuyến mãi">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(PROMOTION_TYPE_LABELS) as [PromotionType, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => switchType(k)}
                  className={`h-9 text-xs font-medium rounded-md border ${form.type === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Section 3: Type-specific reward/conditions */}
          <Section title="Cấu hình">
            {form.type === "percent" && <PercentForm value={form} onChange={setForm} validation={validation} />}
            {form.type === "fixed" && <FixedForm value={form} onChange={setForm} validation={validation} />}
            {form.type === "buy-x-get-y" && <BuyXGetYForm value={form} onChange={setForm} validation={validation} />}
            {form.type === "gift" && <GiftForm value={form} onChange={setForm} validation={validation} />}
            {form.type === "free-shipping" && <FreeShippingForm value={form} onChange={setForm} validation={validation} />}
          </Section>

          {/* Section 4: Time */}
          <Section title="Thời gian áp dụng">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bắt đầu" error={e.startDate} required>
                <DateInput value={form.startDate} onChange={(v) => setBase("startDate", v)} className="w-full h-9" />
              </Field>
              <Field label="Kết thúc" error={e.endDate} required>
                <DateInput allowFuture value={form.endDate} onChange={(v) => setBase("endDate", v)} className="w-full h-9" />
              </Field>
            </div>
          </Section>

          {/* Section 5: Scope — only for discount-based types */}
          {supportsScope(form.type) ? (
            <Section title="Phạm vi áp dụng">
              <div className="flex gap-2">
                {([
                  { v: "all", l: "Toàn bộ" },
                  { v: "categories", l: "Danh mục" },
                  { v: "products", l: "Sản phẩm" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setScopeKind(opt.v)}
                    className={`flex-1 h-9 text-xs font-medium rounded-md border ${form.scope.kind === opt.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
              {form.scope.kind === "all" && (
                <p className="text-[11px] text-muted-foreground mt-2">Áp dụng cho tất cả sản phẩm.</p>
              )}
              {form.scope.kind === "categories" && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2">
                  <MultiPicker
                    options={categories.map((c) => ({ id: c.id, label: c.name, sub: `${c.productCount} SP` }))}
                    selectedIds={form.scope.categoryIds}
                    onToggle={toggleScopeId}
                    onClear={clearScopeIds}
                    placeholder="Tìm danh mục..."
                  />
                  {e.scope && <p className="text-[11px] text-danger mt-1">{e.scope}</p>}
                </div>
              )}
              {form.scope.kind === "products" && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2">
                  <MultiPicker
                    options={products.map((p) => ({ id: p.id, label: p.name, sub: p.code }))}
                    selectedIds={form.scope.productIds}
                    onToggle={toggleScopeId}
                    onClear={clearScopeIds}
                    placeholder="Tìm sản phẩm hoặc mã SP..."
                  />
                  {e.scope && <p className="text-[11px] text-danger mt-1">{e.scope}</p>}
                </div>
              )}
            </Section>
          ) : (
            <Section title="Phạm vi áp dụng">
              <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                {form.type === "buy-x-get-y" &&
                  "Phạm vi được xác định bởi sản phẩm điều kiện (mua) và sản phẩm tặng ở phần Cấu hình."}
                {form.type === "gift" &&
                  "Phạm vi được xác định bởi điều kiện kích hoạt (đơn tối thiểu / sản phẩm chỉ định / số lượng) ở phần Cấu hình."}
                {form.type === "free-shipping" &&
                  "Áp dụng cho phí vận chuyển toàn đơn. Điều kiện cấu hình ở phần phía trên."}
              </div>
            </Section>
          )}

          {/* Section 6: Status */}
          <Section title="Trạng thái">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(ev) => setBase("active", ev.target.checked)} className="h-4 w-4 rounded border-input" />
              <span className="text-sm">Kích hoạt ngay khi lưu</span>
            </label>
          </Section>

          {/* Live preview */}
          <div className="rounded-md border bg-primary-soft/50 p-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Tóm tắt khuyến mãi</p>
            <p className="text-sm font-medium text-primary">{summary}</p>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 text-sm border rounded-md hover:bg-muted">Hủy</button>
          <button
            onClick={() => onSave(form)}
            disabled={hasErrors}
            className="flex-1 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? "Lưu thay đổi" : "Tạo khuyến mãi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children, error, hint, required }: { label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
      {!error && hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
