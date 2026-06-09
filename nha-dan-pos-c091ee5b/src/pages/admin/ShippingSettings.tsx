import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { shipping } from "@/services";
import type { ShippingConfig, ShippingLocalRule, ShippingParcelDefaults, ShippingZoneRule, DeclaredValueMode } from "@/services/types";
import { formatVND } from "@/lib/format";
import { Truck, Plus, Trash2, Save, Loader2, MapPin, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full h-9 px-2.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50";

const emptyZone = (): ShippingZoneRule => ({
  zoneCode: `Z${Math.floor(Math.random() * 90 + 10)}`,
  label: "Khu vực mới",
  baseFee: 30000,
  freeShipThreshold: 500000,
  etaDays: { min: 2, max: 4 },
  provinceCodes: ["*"],
});

const defaultLocalRule = (): ShippingLocalRule => ({
  enabled: true,
  zoneCode: "LOCAL_MO_CAY",
  label: "Mỏ Cày local delivery",
  fee: 0,
  etaDays: { min: 1, max: 1 },
  provinceCodes: ["83", "86"],
  provinceNames: ["Bến Tre", "Vĩnh Long"],
  districtCodes: [],
  districtNames: ["Mỏ Cày", "Mỏ Cày Nam", "Huyện Mỏ Cày Nam"],
  wardCodes: [],
  wardNames: ["Mỏ Cày", "Thị trấn Mỏ Cày"],
});

const DEFAULT_PARCEL: ShippingParcelDefaults = {
  length: 10,
  width: 10,
  height: 10,
  weightGrams: 500,
  declaredValueMode: "none",
};

const hasValues = (values: string[] | undefined) => (values ?? []).some((v) => v.trim().length > 0);

export default function AdminShippingSettings() {
  const [zones, setZones] = useState<ShippingZoneRule[]>([]);
  const [localRules, setLocalRules] = useState<ShippingLocalRule[]>([]);
  const [parcel, setParcel] = useState<ShippingParcelDefaults>(DEFAULT_PARCEL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    shipping.getConfig().then((cfg) => {
      setZones(cfg.zoneRules);
      setLocalRules(cfg.localRules?.length ? cfg.localRules : [defaultLocalRule()]);
      setParcel(cfg.parcelDefaults ?? DEFAULT_PARCEL);
      setLoading(false);
    });
  }, []);

  const updateZone = (idx: number, patch: Partial<ShippingZoneRule>) => {
    setZones((prev) => prev.map((z, i) => (i === idx ? { ...z, ...patch } : z)));
  };

  const updateParcel = (patch: Partial<ShippingParcelDefaults>) => {
    setParcel((p) => ({ ...p, ...patch }));
  };

  const updateProvinceCodes = (idx: number, raw: string) => {
    const codes = raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    updateZone(idx, { provinceCodes: codes.length ? codes : ["*"] });
  };

  const updateLocalRule = (idx: number, patch: Partial<ShippingLocalRule>) => {
    setLocalRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const updateLocalList = (idx: number, field: keyof Pick<ShippingLocalRule, "provinceCodes" | "provinceNames" | "districtCodes" | "districtNames" | "wardCodes" | "wardNames">, raw: string) => {
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    updateLocalRule(idx, { [field]: values } as Partial<ShippingLocalRule>);
  };

  const addZone = () => setZones((p) => [...p, emptyZone()]);
  const removeZone = (idx: number) => setZones((p) => p.filter((_, i) => i !== idx));

  const handleSave = async () => {
    // Basic validation
    for (const z of zones) {
      if (!z.zoneCode.trim() || !z.label.trim()) {
        toast.error("Mỗi zone cần có mã và tên");
        return;
      }
      if (z.etaDays.min > z.etaDays.max) {
        toast.error(`Zone ${z.zoneCode}: ETA min phải ≤ max`);
        return;
      }
    }
    for (const r of localRules) {
      if (!r.zoneCode.trim() || !r.label.trim()) {
        toast.error("Mỗi local rule cần có mã và tên");
        return;
      }
      if (r.etaDays.min > r.etaDays.max) {
        toast.error(`Local rule ${r.zoneCode}: ETA min phải ≤ max`);
        return;
      }
      if (r.enabled) {
        if (!hasValues(r.provinceCodes) && !hasValues(r.provinceNames)) {
          toast.error(`Local rule ${r.zoneCode}: cần matcher tỉnh/thành`);
          return;
        }
        if (!hasValues(r.districtCodes) && !hasValues(r.districtNames)) {
          toast.error(`Local rule ${r.zoneCode}: cần matcher quận/huyện`);
          return;
        }
        if (!hasValues(r.wardCodes) && !hasValues(r.wardNames)) {
          toast.error(`Local rule ${r.zoneCode}: cần matcher phường/xã`);
          return;
        }
      }
    }
    if (parcel.length < 1 || parcel.width < 1 || parcel.height < 1 || parcel.weightGrams < 1) {
      toast.error("Kích thước & khối lượng gói hàng phải > 0");
      return;
    }
    setSaving(true);
    try {
      const cfg: ShippingConfig = { zoneRules: zones, localRules, parcelDefaults: parcel };
      await shipping.saveConfig(cfg);
      toast.success("Đã lưu cấu hình giao hàng");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải cấu hình…
      </div>
    );
  }

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Cài đặt giao hàng"
        description="Quản lý zone, phí cơ bản, ngưỡng miễn phí và thời gian dự kiến"
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-background rounded-md hover:bg-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lưu thay đổi
          </button>
        }
      />

      <div className="bg-info-soft border border-info/20 rounded-lg p-3 text-xs text-info flex items-start gap-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <b>provinceCodes</b> là danh sách mã tỉnh (VD: <code>01,79,74</code>) ngăn cách bằng dấu phẩy. Dùng <code>*</code> làm zone mặc định cho mọi tỉnh chưa được gán.
        </span>
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-success" />
            <h3 className="font-semibold text-sm">Local shipping rules</h3>
          </div>
          <button
            type="button"
            onClick={() => setLocalRules((prev) => [...prev, defaultLocalRule()])}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Thêm local rule
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Rule local được kiểm tra sau khi đủ tỉnh/quận/xã và trước GHN. Chỉ dùng mã/tên tỉnh-quận-xã; không dùng số nhà, đường hoặc rawAddress để tính phí.
        </p>
        {localRules.map((r, idx) => (
          <div key={`${r.zoneCode}-${idx}`} className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => updateLocalRule(idx, { enabled: e.target.checked })}
                />
                Bật rule
              </label>
              <button
                type="button"
                onClick={() => setLocalRules((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted"
                title="Xóa local rule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Mã rule / zoneCode</label>
                <input
                  data-testid={`shipping-local-rule-zone-code-${idx}`}
                  className={inputCls}
                  value={r.zoneCode}
                  onChange={(e) => updateLocalRule(idx, { zoneCode: e.target.value })}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="text-[11px] font-semibold text-muted-foreground">Tên hiển thị</label>
                <input className={inputCls} value={r.label} onChange={(e) => updateLocalRule(idx, { label: e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Phí local (đ)</label>
                <input type="number" min={0} step={1000} className={inputCls} value={r.fee} onChange={(e) => updateLocalRule(idx, { fee: Number(e.target.value) || 0 })} />
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatVND(r.fee)}</p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">ETA min</label>
                <input type="number" min={1} className={inputCls} value={r.etaDays.min} onChange={(e) => updateLocalRule(idx, { etaDays: { ...r.etaDays, min: Number(e.target.value) || 1 } })} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">ETA max</label>
                <input type="number" min={1} className={inputCls} value={r.etaDays.max} onChange={(e) => updateLocalRule(idx, { etaDays: { ...r.etaDays, max: Number(e.target.value) || 1 } })} />
              </div>
              <div className="md:col-span-2 lg:col-span-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Province codes</label>
                  <input className={cn(inputCls, "font-mono")} value={r.provinceCodes.join(", ")} onChange={(e) => updateLocalList(idx, "provinceCodes", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Province names</label>
                  <input className={inputCls} value={r.provinceNames.join(", ")} onChange={(e) => updateLocalList(idx, "provinceNames", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">District codes</label>
                  <input className={cn(inputCls, "font-mono")} value={r.districtCodes.join(", ")} onChange={(e) => updateLocalList(idx, "districtCodes", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">District names</label>
                  <input className={inputCls} value={r.districtNames.join(", ")} onChange={(e) => updateLocalList(idx, "districtNames", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Ward codes</label>
                  <input className={cn(inputCls, "font-mono")} value={r.wardCodes.join(", ")} onChange={(e) => updateLocalList(idx, "wardCodes", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Ward names</label>
                  <input className={inputCls} value={r.wardNames.join(", ")} onChange={(e) => updateLocalList(idx, "wardNames", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Mặc định gói hàng (gửi cho GHN)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Các giá trị này được gửi tới GHN để tính phí. Kích thước nhỏ hơn → phí thấp hơn (GHN dùng <code>D×R×C/5000</code> để tính khối lượng quy đổi).
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Dài (cm)</label>
            <input type="number" min={1} max={200} className={inputCls}
              value={parcel.length}
              onChange={(e) => updateParcel({ length: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Rộng (cm)</label>
            <input type="number" min={1} max={200} className={inputCls}
              value={parcel.width}
              onChange={(e) => updateParcel({ width: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Cao (cm)</label>
            <input type="number" min={1} max={200} className={inputCls}
              value={parcel.height}
              onChange={(e) => updateParcel({ height: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Khối lượng mặc định (g)</label>
            <input type="number" min={1} max={30000} step={100} className={inputCls}
              value={parcel.weightGrams}
              onChange={(e) => updateParcel({ weightGrams: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Khai giá / Bảo hiểm</label>
            <select className={inputCls}
              value={parcel.declaredValueMode}
              onChange={(e) => updateParcel({ declaredValueMode: e.target.value as DeclaredValueMode })}>
              <option value="none">Không khai giá (phí thấp nhất)</option>
              <option value="subtotal">Theo giá trị đơn hàng</option>
              <option value="fixed">Số cố định</option>
            </select>
          </div>
          {parcel.declaredValueMode === "fixed" && (
            <div className="lg:col-span-5">
              <label className="text-[11px] font-semibold text-muted-foreground">Giá trị khai cố định (đ, tối đa 5.000.000)</label>
              <input type="number" min={0} max={5_000_000} step={10000} className={inputCls}
                value={parcel.declaredValueFixed ?? 0}
                onChange={(e) => updateParcel({ declaredValueFixed: Number(e.target.value) || 0 })} />
              <p className="text-[10px] text-muted-foreground mt-0.5">{formatVND(parcel.declaredValueFixed ?? 0)}</p>
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
          💡 Mẹo: để khớp với form ước tính phí trên trang GHN (giaohangnhanh.vn), dùng <b>10×10×10 cm</b> + <b>Không khai giá</b>.
        </div>
      </div>

      <div className="space-y-3">
        {zones.map((z, idx) => (
          <div
            key={idx}
            className={cn(
              "bg-card rounded-lg border p-4 space-y-3",
              z.provinceCodes.includes("*") && "border-primary/40"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs font-bold">{z.zoneCode}</span>
                <span className="text-xs text-muted-foreground">— {z.label}</span>
                {z.provinceCodes.includes("*") && (
                  <span className="text-[10px] bg-primary-soft text-primary rounded px-1.5 py-0.5 font-semibold">
                    Mặc định
                  </span>
                )}
              </div>
              <button
                onClick={() => removeZone(idx)}
                className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted"
                title="Xóa zone"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Mã zone</label>
                <input
                  className={inputCls}
                  value={z.zoneCode}
                  onChange={(e) => updateZone(idx, { zoneCode: e.target.value })}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="text-[11px] font-semibold text-muted-foreground">Tên hiển thị</label>
                <input
                  className={inputCls}
                  value={z.label}
                  onChange={(e) => updateZone(idx, { label: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Phí cơ bản (đ)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className={inputCls}
                  value={z.baseFee}
                  onChange={(e) => updateZone(idx, { baseFee: Number(e.target.value) || 0 })}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatVND(z.baseFee)}</p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Ngưỡng miễn phí (đ)</label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  className={inputCls}
                  value={z.freeShipThreshold ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    updateZone(idx, { freeShipThreshold: v > 0 ? v : undefined });
                  }}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {z.freeShipThreshold ? formatVND(z.freeShipThreshold) : "Không áp dụng"}
                </p>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">ETA tối thiểu (ngày)</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={z.etaDays.min}
                  onChange={(e) =>
                    updateZone(idx, { etaDays: { ...z.etaDays, min: Number(e.target.value) || 1 } })
                  }
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">ETA tối đa (ngày)</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={z.etaDays.max}
                  onChange={(e) =>
                    updateZone(idx, { etaDays: { ...z.etaDays, max: Number(e.target.value) || 1 } })
                  }
                />
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Mã tỉnh áp dụng (cách nhau bởi dấu phẩy, dùng <code>*</code> cho mọi nơi)
                </label>
                <input
                  className={cn(inputCls, "font-mono")}
                  value={z.provinceCodes.join(", ")}
                  onChange={(e) => updateProvinceCodes(idx, e.target.value)}
                  placeholder="01, 79, 74 hoặc *"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addZone}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" /> Thêm zone giao hàng
        </button>
      </div>
    </div>
  );
}
