import { useEffect, useId, useState } from "react";
import { addresses } from "@/services";
import type { District, Province, Ward } from "@/services/types";
import { cn } from "@/lib/utils";

export interface AddressSelectValue {
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  wardCode: string;
  wardName: string;
}

interface Props {
  value: AddressSelectValue;
  onChange: (next: AddressSelectValue) => void;
  className?: string;
  /** Optional inline errors for each level. */
  errors?: { province?: string; district?: string; ward?: string };
}

const EMPTY: AddressSelectValue = {
  provinceCode: "",
  provinceName: "",
  districtCode: "",
  districtName: "",
  wardCode: "",
  wardName: "",
};

const selectCls =
  "mt-1.5 w-full h-11 px-3 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50";

export function AddressSelect({ value, onChange, className, errors }: Props) {
  const idBase = useId();
  const provinceId = `${idBase}-province`;
  const districtId = `${idBase}-district`;
  const wardId = `${idBase}-ward`;
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  useEffect(() => {
    addresses.listProvinces().then(setProvinces);
  }, []);

  useEffect(() => {
    if (!value.provinceCode) {
      setDistricts([]);
      return;
    }
    addresses.listDistricts(value.provinceCode).then(setDistricts);
  }, [value.provinceCode]);

  useEffect(() => {
    if (!value.districtCode) {
      setWards([]);
      return;
    }
    addresses.listWards(value.districtCode).then(setWards);
  }, [value.districtCode]);

  const handleProvince = (code: string) => {
    const p = provinces.find((x) => x.code === code);
    onChange({
      ...EMPTY,
      provinceCode: p?.code ?? "",
      provinceName: p?.name ?? "",
    });
  };

  const handleDistrict = (code: string) => {
    const d = districts.find((x) => x.code === code);
    onChange({
      ...value,
      districtCode: d?.code ?? "",
      districtName: d?.name ?? "",
      wardCode: "",
      wardName: "",
    });
  };

  const handleWard = (code: string) => {
    const w = wards.find((x) => x.code === code);
    onChange({
      ...value,
      wardCode: w?.code ?? "",
      wardName: w?.name ?? "",
    });
  };

  const errCls = "border-destructive/60 focus:ring-destructive/30 focus:border-destructive";

  return (
    <div className={cn("grid gap-3.5 sm:grid-cols-3", className)}>
      <div>
        <label htmlFor={provinceId} className="text-xs font-semibold text-muted-foreground">Tỉnh / Thành phố *</label>
        <select
          id={provinceId}
          value={value.provinceCode}
          onChange={(e) => handleProvince(e.target.value)}
          className={cn(selectCls, errors?.province && errCls)}
        >
          <option value="">— Chọn —</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        {errors?.province && <p className="mt-1 text-[11px] text-destructive">{errors.province}</p>}
      </div>
      <div>
        <label htmlFor={districtId} className="text-xs font-semibold text-muted-foreground">Quận / Huyện *</label>
        <select
          id={districtId}
          value={value.districtCode}
          onChange={(e) => handleDistrict(e.target.value)}
          disabled={!value.provinceCode}
          className={cn(selectCls, !value.provinceCode && "opacity-60", errors?.district && errCls)}
        >
          <option value="">— Chọn —</option>
          {districts.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
        {errors?.district && <p className="mt-1 text-[11px] text-destructive">{errors.district}</p>}
      </div>
      <div>
        <label htmlFor={wardId} className="text-xs font-semibold text-muted-foreground">Phường / Xã *</label>
        <select
          id={wardId}
          value={value.wardCode}
          onChange={(e) => handleWard(e.target.value)}
          disabled={!value.districtCode}
          className={cn(selectCls, !value.districtCode && "opacity-60", errors?.ward && errCls)}
        >
          <option value="">— Chọn —</option>
          {wards.map((w) => (
            <option key={w.code} value={w.code}>{w.name}</option>
          ))}
        </select>
        {errors?.ward && <p className="mt-1 text-[11px] text-destructive">{errors.ward}</p>}
      </div>
    </div>
  );
}
