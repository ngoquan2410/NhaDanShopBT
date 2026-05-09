import { useEffect, useRef, useState, useCallback } from "react";
import { Search, Loader2, AlertTriangle, MapPin } from "lucide-react";
import { addresses } from "@/services";
import {
  fetchAddressAutocomplete,
  fetchAddressPlaceDetail,
} from "@/services/addresses/addressAutocompleteApi";
import type { Province, District, Ward } from "@/services/types";
import { cn } from "@/lib/utils";

export interface GoongResolvedAddress {
  street: string;
  formattedAddress: string;
  provinceCode?: string;
  provinceName?: string;
  districtCode?: string;
  districtName?: string;
  wardCode?: string;
  wardName?: string;
  lat?: number;
  lng?: number;
  /** Which administrative levels Goong returned text for but we could NOT
   *  confidently match against our VN dataset. Caller can use this to warn. */
  unmatched?: Array<"province" | "district" | "ward">;
  /** Raw text Goong returned for each level (best-effort). */
  rawCompound?: { province?: string; district?: string; commune?: string };
}

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
}

export type AutocompleteState =
  | "idle"
  | "typing"
  | "searching"
  | "noresult"
  | "error"
  | "fallback";

export type FallbackReason = "quota_exceeded" | "network_error" | "rate_limited" | "provider_disabled";

interface Props {
  /** Called when the user picks a suggestion. Provides the best-effort mapping
   *  to our VN administrative dataset. Caller decides whether to overwrite. */
  onResolved: (addr: GoongResolvedAddress) => void;
  /** Called when fallback (manual) mode is forced — quota / network / disabled. */
  onFallback?: (reason: FallbackReason) => void;
  /** Notified whenever the internal state changes. Useful for parent banners. */
  onStateChange?: (state: AutocompleteState) => void;
  /** Notified whenever raw input text changes (so caller can keep the original
   *  user-entered string for display/audit). */
  onInputChange?: (raw: string) => void;
  defaultValue?: string;
  className?: string;
  /** When true, the proxy will NOT call Goong upstream (uses cache only). */
  dryRun?: boolean;
  /** When true, ignore session-persisted fallback flag (dev test page). */
  ignoreSessionFallback?: boolean;
}

const DEBOUNCE_MS = 700;
const MIN_CHARS = 4;
const SESSION_FALLBACK_KEY = "goong:fallback";

// Session-scoped cache so identical re-queries during a single visit are free.
const localAcCache = new Map<string, Prediction[]>();
const localDetailCache = new Map<string, GoongResolvedAddress>();

// Dedupe in-flight identical autocomplete queries across rapid retypes / remounts.
const inflightAc = new Map<string, Promise<Prediction[] | "quota" | "error" | "provider_disabled">>();
// Dedupe in-flight detail lookups (StrictMode double-mount, accidental double-click).
const inflightDetail = new Map<string, Promise<GoongResolvedAddress | "quota" | "error" | "provider_disabled">>();

function readSessionFallback(): FallbackReason | null {
  try {
    const v = sessionStorage.getItem(SESSION_FALLBACK_KEY);
    return v as FallbackReason | null;
  } catch {
    return null;
  }
}
function writeSessionFallback(reason: FallbackReason) {
  try { sessionStorage.setItem(SESSION_FALLBACK_KEY, reason); } catch { /* ignore */ }
}
export function clearSessionFallback() {
  try { sessionStorage.removeItem(SESSION_FALLBACK_KEY); } catch { /* ignore */ }
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function coreName(s: string): string {
  return stripDiacritics(s)
    .replace(/^(tinh|thanh pho|tp\.?|tp|quan|huyen|thi xa|thi tran|phuong|xa)\s+/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findByName<T extends { code: string; name: string }>(list: T[], target: string): T | undefined {
  if (!target) return undefined;
  const t = coreName(target);
  return (
    list.find((x) => coreName(x.name) === t) ??
    list.find((x) => coreName(x.name).includes(t) || t.includes(coreName(x.name)))
  );
}

interface CompoundShape {
  province?: string;
  district?: string;
  commune?: string;
}

interface MappingResult {
  provinceCode?: string;
  provinceName?: string;
  districtCode?: string;
  districtName?: string;
  wardCode?: string;
  wardName?: string;
  unmatched: Array<"province" | "district" | "ward">;
}

async function mapToDataset(compound: CompoundShape | undefined, fallbackText: string): Promise<MappingResult> {
  const provinces = await addresses.listProvinces();
  const provName = compound?.province ?? "";
  const districtName = compound?.district ?? "";
  const wardName = compound?.commune ?? "";
  const text = fallbackText ?? "";
  const unmatched: Array<"province" | "district" | "ward"> = [];

  const province =
    findByName(provinces, provName) ??
    provinces.find((p) => coreName(text).includes(coreName(p.name)));
  if (!province) {
    if (provName) unmatched.push("province");
    if (districtName) unmatched.push("district");
    if (wardName) unmatched.push("ward");
    return { unmatched };
  }

  const districts = await addresses.listDistricts(province.code);
  const district =
    findByName(districts, districtName) ??
    districts.find((d) => coreName(text).includes(coreName(d.name)));
  const result: MappingResult = {
    provinceCode: province.code,
    provinceName: province.name,
    districtCode: district?.code,
    districtName: district?.name,
    unmatched,
  };
  if (!district) {
    if (districtName) result.unmatched.push("district");
    if (wardName) result.unmatched.push("ward");
    return result;
  }
  const wards = await addresses.listWards(district.code);
  const ward =
    findByName(wards, wardName) ??
    wards.find((w) => coreName(text).includes(coreName(w.name)));
  if (ward) {
    result.wardCode = ward.code;
    result.wardName = ward.name;
  } else if (wardName) {
    result.unmatched.push("ward");
  }
  return result;
}

export function AddressAutocomplete({
  onResolved,
  onFallback,
  onStateChange,
  onInputChange,
  defaultValue = "",
  className,
  dryRun = false,
  ignoreSessionFallback = false,
}: Props) {
  const initialFallback = !ignoreSessionFallback ? readSessionFallback() : null;
  const [input, setInput] = useState(defaultValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setStateInner] = useState<AutocompleteState>(initialFallback ? "fallback" : "idle");
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const setState = useCallback((s: AutocompleteState) => {
    setStateInner((prev) => {
      if (prev !== s) onStateChangeRef.current?.(s);
      return s;
    });
  }, []);

  // Notify parent of initial state (so banners render on mount).
  useEffect(() => {
    onStateChangeRef.current?.(initialFallback ? "fallback" : "idle");
    if (initialFallback) onFallback?.(initialFallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const enterFallback = useCallback((reason: FallbackReason) => {
    if (!ignoreSessionFallback) writeSessionFallback(reason);
    setState("fallback");
    setPredictions([]);
    setOpen(false);
    onFallback?.(reason);
  }, [onFallback, ignoreSessionFallback, setState]);

  const runSearch = useCallback(async (q: string) => {
    if (!ignoreSessionFallback && readSessionFallback()) {
      setState("fallback");
      return;
    }
    if (q.length < MIN_CHARS) {
      setPredictions([]);
      setState("typing");
      return;
    }
    const key = q.trim().toLowerCase().replace(/\s+/g, " ");
    const cached = localAcCache.get(key);
    if (cached) {
      setPredictions(cached);
      setState(cached.length ? "idle" : "noresult");
      setOpen(true);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState("searching");

    // Dedupe identical in-flight requests
    let promise = inflightAc.get(key);
    if (!promise) {
      promise = (async (): Promise<Prediction[] | "quota" | "error" | "provider_disabled"> => {
        try {
          const data = await fetchAddressAutocomplete(q, { dryRun });
          if (data?.providerUnavailable) return "provider_disabled";
          if (data?.quotaExceeded) return "quota";
          const preds: Prediction[] = (data?.predictions ?? []).slice(0, 5);
          localAcCache.set(key, preds);
          return preds;
        } catch {
          return "error";
        } finally {
          inflightAc.delete(key);
        }
      })();
      inflightAc.set(key, promise);
    }

    const result = await promise;
    if (ctrl.signal.aborted) return;
    if (result === "error") return enterFallback("network_error");
    if (result === "provider_disabled") return enterFallback("provider_disabled");
    if (result === "quota") return enterFallback("quota_exceeded");
    setPredictions(result);
    setState(result.length ? "idle" : "noresult");
    setOpen(true);
  }, [enterFallback, dryRun, ignoreSessionFallback, setState]);

  const onChange = (val: string) => {
    setInput(val);
    onInputChange?.(val);
    if (!ignoreSessionFallback && readSessionFallback()) return;
    setState("typing");
    setOpen(val.length >= MIN_CHARS);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(val), DEBOUNCE_MS);
  };

  const pickPrediction = async (p: Prediction) => {
    setOpen(false);
    setInput(p.description);
    onInputChange?.(p.description);
    const cachedDetail = localDetailCache.get(p.place_id);
    if (cachedDetail) {
      onResolved({ ...cachedDetail, street: cachedDetail.street || p.structured_formatting?.main_text || p.description });
      return;
    }
    setState("searching");

    // Single-flight: if a detail request for this place_id is already running
    // (e.g. StrictMode double-invoke or rapid double-click), reuse it.
    let promise = inflightDetail.get(p.place_id);
    if (!promise) {
      promise = (async (): Promise<GoongResolvedAddress | "quota" | "error" | "provider_disabled"> => {
        try {
          const data = await fetchAddressPlaceDetail(p.place_id, { dryRun });
          if (data?.providerUnavailable) return "provider_disabled";
          if (data?.quotaExceeded) return "quota";
          const r = data?.result;
          const compound = (r?.compound ?? {}) as CompoundShape;
          const formatted = r?.formatted_address ?? p.description;
          const mapped = await mapToDataset(compound, formatted);
          const street = p.structured_formatting?.main_text || (r?.name as string) || formatted.split(",")[0] || "";
          const resolved: GoongResolvedAddress = {
            street,
            formattedAddress: formatted,
            provinceCode: mapped.provinceCode,
            provinceName: mapped.provinceName,
            districtCode: mapped.districtCode,
            districtName: mapped.districtName,
            wardCode: mapped.wardCode,
            wardName: mapped.wardName,
            unmatched: mapped.unmatched,
            rawCompound: { province: compound.province, district: compound.district, commune: compound.commune },
            lat: r?.geometry?.location?.lat,
            lng: r?.geometry?.location?.lng,
          };
          localDetailCache.set(p.place_id, resolved);
          return resolved;
        } catch {
          return "error";
        } finally {
          inflightDetail.delete(p.place_id);
        }
      })();
      inflightDetail.set(p.place_id, promise);
    }

    const result = await promise;
    if (result === "error") { enterFallback("network_error"); return; }
    if (result === "provider_disabled") { enterFallback("provider_disabled"); return; }
    if (result === "quota") { enterFallback("quota_exceeded"); return; }
    onResolved(result);
    setState("idle");
  };

  if (state === "fallback") {
    return (
      <div className={cn("rounded-xl border border-warning/40 bg-warning-soft/40 p-3 flex items-start gap-2", className)}>
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-warning-foreground">
            Tạm thời không dùng được gợi ý địa chỉ, vui lòng chọn tỉnh/quận/phường và nhập địa chỉ thủ công bên dưới.
          </p>
          <button
            type="button"
            onClick={() => {
              clearSessionFallback();
              setState("idle");
              if (input.length >= MIN_CHARS) runSearch(input);
            }}
            className="mt-1.5 text-xs font-semibold text-warning-foreground underline underline-offset-2 hover:opacity-80"
          >
            Thử lại gợi ý địa chỉ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label className="text-xs font-semibold text-muted-foreground">Tìm địa chỉ (có thể nhập thủ công)</label>
      <div className="relative mt-1.5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          placeholder="VD: Tên tiệm, số nhà, đường, phường/xã, quận/huyện, tỉnh"
          className="w-full h-11 pl-10 pr-10 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          autoComplete="off"
        />
        {state === "searching" && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-popover border rounded-xl shadow-lg overflow-hidden">
          {state === "searching" && predictions.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
            </div>
          )}
          {state === "noresult" && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Không có gợi ý — bạn có thể nhập địa chỉ thủ công bên dưới.</div>
          )}
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => pickPrediction(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-start gap-2.5 border-b last:border-b-0"
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.structured_formatting?.main_text ?? p.description}</p>
                {p.structured_formatting?.secondary_text && (
                  <p className="text-xs text-muted-foreground truncate">{p.structured_formatting.secondary_text}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type { Province, District, Ward };
