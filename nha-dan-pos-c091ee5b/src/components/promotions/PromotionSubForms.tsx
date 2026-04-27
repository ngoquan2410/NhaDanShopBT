import type { PercentPromotion, FixedPromotion, FreeShippingPromotion, BuyXGetYPromotion, GiftPromotion, ValidationResult } from "@/lib/promotions";
import { ProductQuantityList } from "./ProductQuantityList";
import { ProductPicker } from "./ProductPicker";

interface FieldProps { label: string; children: React.ReactNode; error?: string; warning?: string; hint?: string; required?: boolean }
function Field({ label, children, error, warning, hint, required }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
      {!error && warning && <p className="text-[11px] text-warning mt-1">⚠ {warning}</p>}
      {!error && !warning && hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

const numberInput = (val: number | undefined, onChange: (n: number | undefined) => void, opts?: { min?: number; placeholder?: string; allowEmpty?: boolean }) => (
  <input
    type="number"
    min={opts?.min ?? 0}
    value={val ?? ""}
    placeholder={opts?.placeholder}
    onChange={(e) => {
      const raw = e.target.value;
      if (raw === "" && opts?.allowEmpty !== false) return onChange(undefined);
      const n = Number(raw);
      onChange(Number.isNaN(n) ? undefined : Math.max(opts?.min ?? 0, n));
    }}
    className="w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
  />
);

// ===== Percent =====
export function PercentForm({ value, onChange, validation }: { value: PercentPromotion; onChange: (v: PercentPromotion) => void; validation: ValidationResult }) {
  const e = validation.errors, w = validation.warnings;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phần trăm giảm (%)" error={e.percent} required>
          <input type="number" min={1} max={100} value={value.percent} onChange={(ev) => onChange({ ...value, percent: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) })}
            className="w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
        </Field>
        <Field label="Giảm tối đa (₫)" error={e.maxDiscount} hint="Tùy chọn — để trống nếu không giới hạn">
          {numberInput(value.maxDiscount, (n) => onChange({ ...value, maxDiscount: n }), { placeholder: "Không giới hạn" })}
        </Field>
      </div>
      <Field label="Đơn tối thiểu (₫)" error={e.minOrder} hint="Tùy chọn">
        {numberInput(value.minOrder, (n) => onChange({ ...value, minOrder: n }), { placeholder: "0" })}
      </Field>
    </div>
  );
}

// ===== Fixed =====
export function FixedForm({ value, onChange, validation }: { value: FixedPromotion; onChange: (v: FixedPromotion) => void; validation: ValidationResult }) {
  const e = validation.errors, w = validation.warnings;
  return (
    <div className="space-y-3">
      <Field label="Số tiền giảm (₫)" error={e.amount} warning={w.amount} required>
        <input type="number" min={0} value={value.amount} onChange={(ev) => onChange({ ...value, amount: Math.max(0, Number(ev.target.value) || 0) })}
          className="w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" />
      </Field>
      <Field label="Đơn tối thiểu (₫)" error={e.minOrder} hint="Tùy chọn">
        {numberInput(value.minOrder, (n) => onChange({ ...value, minOrder: n }), { placeholder: "0" })}
      </Field>
    </div>
  );
}

// ===== Buy X Get Y =====
export function BuyXGetYForm({ value, onChange, validation }: { value: BuyXGetYPromotion; onChange: (v: BuyXGetYPromotion) => void; validation: ValidationResult }) {
  const e = validation.errors;
  return (
    <div className="space-y-3">
      <Field label="Hình thức">
        <div className="flex gap-2">
          {([
            { v: "same", l: "Cùng sản phẩm" },
            { v: "different", l: "Sản phẩm khác" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange({ ...value, mode: opt.v })}
              className={`flex-1 h-9 text-xs font-medium rounded-md border ${value.mode === opt.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </Field>

      <ProductQuantityList
        label="Sản phẩm điều kiện (mua) *"
        items={value.buyItems}
        onChange={(items) => onChange({ ...value, buyItems: items })}
        error={e.buyItems}
      />

      <ProductQuantityList
        label="Sản phẩm tặng *"
        items={value.getItems}
        onChange={(items) => onChange({ ...value, getItems: items })}
        error={e.getItems}
        excludeProductIds={value.mode === "different" ? value.buyItems.map((b) => b.productId) : []}
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={value.repeatable} onChange={(ev) => onChange({ ...value, repeatable: ev.target.checked })} className="h-4 w-4 rounded border-input" />
        <span className="text-xs">Lặp lại theo bội số (mua N lần điều kiện = tặng N lần phần thưởng)</span>
      </label>
    </div>
  );
}

// ===== Gift =====
export function GiftForm({ value, onChange, validation }: { value: GiftPromotion; onChange: (v: GiftPromotion) => void; validation: ValidationResult }) {
  const e = validation.errors;
  const triggerLabel =
    value.triggerType === "min-order" ? "Giá trị đơn tối thiểu (₫)" :
    value.triggerType === "buy-quantity" ? "Số lượng tối thiểu của sản phẩm chỉ định" : "Tự động kích hoạt khi mua sản phẩm";

  return (
    <div className="space-y-3">
      <Field label="Điều kiện kích hoạt">
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "min-order", l: "Đơn tối thiểu" },
            { v: "buy-product", l: "Mua SP chỉ định" },
            { v: "buy-quantity", l: "Mua đủ SL" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange({ ...value, triggerType: opt.v, triggerValue: opt.v === "buy-product" ? 1 : value.triggerValue })}
              className={`h-9 text-xs font-medium rounded-md border ${value.triggerType === opt.v ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </Field>

      {value.triggerType === "min-order" && (
        <p className="text-[11px] text-muted-foreground -mt-1">Tính trên tổng giá trị toàn đơn hàng.</p>
      )}

      {(value.triggerType === "buy-product" || value.triggerType === "buy-quantity") && (
        <Field
          label="Sản phẩm kích hoạt"
          error={e.triggerProductId}
          hint={value.triggerType === "buy-quantity" ? "Số lượng được tính trên đúng sản phẩm này trong giỏ." : undefined}
          required
        >
          <ProductPicker
            value={value.triggerProductId}
            valueName={value.triggerProductName}
            onChange={(id, name) => onChange({ ...value, triggerProductId: id, triggerProductName: name })}
          />
        </Field>
      )}

      {value.triggerType !== "buy-product" && (
        <Field label={triggerLabel} error={e.triggerValue} required>
          <input
            type="number"
            min={0}
            value={value.triggerValue}
            onChange={(ev) => onChange({ ...value, triggerValue: Math.max(0, Number(ev.target.value) || 0) })}
            className="w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
      )}

      <ProductQuantityList
        label="Quà tặng *"
        items={value.giftItems}
        onChange={(items) => onChange({ ...value, giftItems: items })}
        error={e.giftItems}
      />

      <Field label="Giới hạn tồn kho quà" error={e.giftStockLimit} hint="Tùy chọn — để trống nếu không giới hạn">
        {numberInput(value.giftStockLimit, (n) => onChange({ ...value, giftStockLimit: n }), { placeholder: "Không giới hạn" })}
      </Field>
    </div>
  );
}

// ===== Free Shipping =====
export function FreeShippingForm({ value, onChange, validation }: { value: FreeShippingPromotion; onChange: (v: FreeShippingPromotion) => void; validation: ValidationResult }) {
  const e = validation.errors;
  return (
    <div className="space-y-3">
      <Field label="Đơn tối thiểu (₫)" error={e.minOrder} hint="Tùy chọn">
        {numberInput(value.minOrder, (n) => onChange({ ...value, minOrder: n }), { placeholder: "0" })}
      </Field>
      <Field label="Mức ship được giảm tối đa (₫)" error={e.maxShippingDiscount} hint="Tùy chọn — để trống nếu giảm toàn bộ ship">
        {numberInput(value.maxShippingDiscount, (n) => onChange({ ...value, maxShippingDiscount: n }), { placeholder: "Toàn bộ phí ship" })}
      </Field>
    </div>
  );
}
