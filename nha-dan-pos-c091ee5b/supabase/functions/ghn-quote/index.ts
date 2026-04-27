// GHN Fee quote edge function.
// Maps Province Open API names → GHN internal IDs and returns shipping fee.
// Also writes a log row to public.ghn_quote_logs (uses service role to bypass RLS).
import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHN_BASE = "https://online-gateway.ghn.vn/shiip/public-api";

const BodySchema = z.object({
  provinceName: z.string().min(1),
  districtName: z.string().min(1),
  wardName: z.string().min(1),
  weightGrams: z.number().int().min(1).max(30000).optional(),
  subtotal: z.number().min(0),
  orderCode: z.string().optional(),
  length: z.number().int().min(1).max(200).optional(),
  width: z.number().int().min(1).max(200).optional(),
  height: z.number().int().min(1).max(200).optional(),
  insuranceValue: z.number().min(0).max(5_000_000).optional(),
});

type Province = { ProvinceID: number; ProvinceName: string; NameExtension?: string[] };
type District = { DistrictID: number; ProvinceID: number; DistrictName: string; NameExtension?: string[] };
type Ward = { WardCode: string; DistrictID: number; WardName: string; NameExtension?: string[] };

interface CacheEntry<T> { at: number; data: T }
const TTL = 24 * 60 * 60 * 1000;
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const provinceCache: { v: CacheEntry<Province[]> | null } = { v: null };
const districtCache = new Map<number, CacheEntry<District[]>>();
const wardCache = new Map<number, CacheEntry<Ward[]>>();

function fresh<T>(c: CacheEntry<T> | null | undefined): c is CacheEntry<T> {
  return !!c && Date.now() - c.at < TTL;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/^(tinh|thanh pho|tp\.?|quan|huyen|thi xa|phuong|xa|thi tran)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toVnDayBucket(tsMs: number): number {
  return Math.floor((tsMs + VN_UTC_OFFSET_MS) / 86_400_000);
}

function leadtimeToEtaDays(leadtimeUnixSeconds: number): number {
  const todayBucket = toVnDayBucket(Date.now());
  const targetBucket = toVnDayBucket(leadtimeUnixSeconds * 1000);
  return Math.max(1, targetBucket - todayBucket);
}

function matchByName<T extends { NameExtension?: string[] }>(
  list: T[],
  target: string,
  getName: (t: T) => string,
): T | null {
  const n = norm(target);
  for (const it of list) {
    if (norm(getName(it)) === n) return it;
    if (it.NameExtension?.some((e) => norm(e) === n)) return it;
  }
  for (const it of list) {
    const nm = norm(getName(it));
    if (nm.includes(n) || n.includes(nm)) return it;
    if (it.NameExtension?.some((e) => norm(e).includes(n) || n.includes(norm(e)))) return it;
  }
  return null;
}

async function ghnFetch<T>(path: string, token: string, body?: unknown, method = "GET"): Promise<T> {
  const res = await fetch(`${GHN_BASE}${path}`, {
    method,
    headers: { Token: token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(`GHN ${path} failed: ${json.message ?? res.statusText}`);
  }
  return json.data as T;
}

async function getProvinces(token: string): Promise<Province[]> {
  if (fresh(provinceCache.v)) return provinceCache.v!.data;
  const data = await ghnFetch<Province[]>("/master-data/province", token);
  provinceCache.v = { at: Date.now(), data };
  return data;
}

async function getDistricts(token: string, provinceId: number): Promise<District[]> {
  const c = districtCache.get(provinceId);
  if (fresh(c)) return c!.data;
  const data = await ghnFetch<District[]>("/master-data/district", token, { province_id: provinceId }, "POST");
  districtCache.set(provinceId, { at: Date.now(), data });
  return data;
}

async function getWards(token: string, districtId: number): Promise<Ward[]> {
  const c = wardCache.get(districtId);
  if (fresh(c)) return c!.data;
  const data = await ghnFetch<Ward[]>("/master-data/ward", token, { district_id: districtId }, "POST");
  wardCache.set(districtId, { at: Date.now(), data });
  return data;
}

function makeLogger() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface LogPayload {
  provinceName: string;
  districtName: string;
  wardName: string;
  weightGrams?: number;
  subtotal?: number;
  ok: boolean;
  fee?: number;
  etaMin?: number;
  etaMax?: number;
  serviceId?: number;
  reason?: string;
  message?: string;
  latencyMs: number;
  orderCode?: string;
  rawResponse?: unknown;
}

async function writeLog(p: LogPayload): Promise<void> {
  try {
    const client = makeLogger();
    if (!client) return;
    await client.from("ghn_quote_logs").insert({
      province_name: p.provinceName,
      district_name: p.districtName,
      ward_name: p.wardName,
      weight_grams: p.weightGrams ?? null,
      subtotal: p.subtotal ?? null,
      ok: p.ok,
      fee: p.fee ?? null,
      eta_min: p.etaMin ?? null,
      eta_max: p.etaMax ?? null,
      service_id: p.serviceId ?? null,
      reason: p.reason ?? null,
      message: p.message ?? null,
      latency_ms: Math.round(p.latencyMs),
      order_code: p.orderCode ?? null,
      raw_response: p.rawResponse ?? null,
    });
  } catch (err) {
    console.error("ghn_quote_logs insert failed:", err);
  }
}

function failResponse(reason: string, message: string) {
  return new Response(JSON.stringify({ ok: false, reason, message }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let parsedBody: z.infer<typeof BodySchema> | null = null;

  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ ok: false, reason: "bad_input", message: "Invalid input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    parsedBody = parsed.data;
    const { provinceName, districtName, wardName, weightGrams, subtotal, orderCode, length, width, height, insuranceValue } = parsed.data;

    const TOKEN = Deno.env.get("GHN_TOKEN");
    const SHOP_ID = Deno.env.get("GHN_SHOP_ID");
    // GHN_FROM_DISTRICT_ID is optional now. If not set, GHN derives the pickup
    // district from the shop configured in dashboard (via ShopId header).
    const FROM_DISTRICT = Deno.env.get("GHN_FROM_DISTRICT_ID");

    if (!TOKEN || !SHOP_ID) {
      const out = { reason: "no_config", message: "GHN_TOKEN / GHN_SHOP_ID not configured" };
      void writeLog({
        provinceName, districtName, wardName, weightGrams, subtotal, orderCode,
        ok: false, ...out, latencyMs: Date.now() - startedAt,
      });
      return failResponse(out.reason, out.message);
    }
    const shopId = Number((SHOP_ID ?? "").replace(/\D/g, ""));
    if (!shopId) {
      const out = { reason: "no_config", message: `GHN_SHOP_ID must be numeric (got "${SHOP_ID}")` };
      void writeLog({ provinceName, districtName, wardName, weightGrams, subtotal, orderCode, ok: false, ...out, latencyMs: Date.now() - startedAt });
      return failResponse(out.reason, out.message);
    }
    const fromDistrictId = FROM_DISTRICT ? Number(FROM_DISTRICT.replace(/\D/g, "")) || null : null;

    const provinces = await getProvinces(TOKEN);
    const province = matchByName(provinces, provinceName, (p) => p.ProvinceName);
    if (!province) {
      const out = { reason: "address_unmapped", message: `Province "${provinceName}" not found in GHN` };
      void writeLog({ provinceName, districtName, wardName, weightGrams, subtotal, orderCode, ok: false, ...out, latencyMs: Date.now() - startedAt });
      return failResponse(out.reason, out.message);
    }

    const districts = await getDistricts(TOKEN, province.ProvinceID);
    const district = matchByName(districts, districtName, (d) => d.DistrictName);
    if (!district) {
      const out = { reason: "address_unmapped", message: `District "${districtName}" not found in GHN` };
      void writeLog({ provinceName, districtName, wardName, weightGrams, subtotal, orderCode, ok: false, ...out, latencyMs: Date.now() - startedAt });
      return failResponse(out.reason, out.message);
    }

    const wards = await getWards(TOKEN, district.DistrictID);
    const ward = matchByName(wards, wardName, (w) => w.WardName);
    if (!ward) {
      const out = { reason: "address_unmapped", message: `Ward "${wardName}" not found in GHN` };
      void writeLog({ provinceName, districtName, wardName, weightGrams, subtotal, orderCode, ok: false, ...out, latencyMs: Date.now() - startedAt });
      return failResponse(out.reason, out.message);
    }

    const weight = weightGrams ?? 500;

    // Determine service. If we have a from-district, query available services
    // for the route. Otherwise default to service_type_id=2 (Hàng nhẹ chuẩn);
    // GHN will derive the pickup district from the shop config.
    let serviceId: number | null = null;
    let serviceTypeId = 2;
    if (fromDistrictId) {
      const services = await ghnFetch<Array<{ service_id: number; service_type_id: number }>>(
        "/v2/shipping-order/available-services",
        TOKEN,
        { shop_id: shopId, from_district: fromDistrictId, to_district: district.DistrictID },
        "POST",
      );
      if (!services?.length) {
        const out = { reason: "no_service", message: "No GHN service available for this route" };
        void writeLog({ provinceName, districtName, wardName, weightGrams, subtotal, orderCode, ok: false, ...out, latencyMs: Date.now() - startedAt });
        return failResponse(out.reason, out.message);
      }
      const svc = services.find((s) => s.service_type_id === 2) ?? services[0];
      serviceId = svc.service_id;
      serviceTypeId = svc.service_type_id;
    }

    const feeBody: Record<string, unknown> = {
      service_type_id: serviceTypeId,
      to_district_id: district.DistrictID,
      to_ward_code: ward.WardCode,
      weight,
      length: length ?? 10,
      width: width ?? 10,
      height: height ?? 10,
      insurance_value: insuranceValue ?? 0,
    };
    if (serviceId) feeBody.service_id = serviceId;
    if (fromDistrictId) feeBody.from_district_id = fromDistrictId;

    const feeRes = await fetch(`${GHN_BASE}/v2/shipping-order/fee`, {
      method: "POST",
      headers: { Token: TOKEN, ShopId: String(shopId), "Content-Type": "application/json" },
      body: JSON.stringify(feeBody),
    });
    const feeJson = await feeRes.json();
    if (!feeRes.ok || feeJson.code !== 200) {
      console.error("GHN fee error:", feeJson);
      const out = { reason: "ghn_error", message: feeJson.message ?? "GHN fee API failed" };
      void writeLog({
        provinceName, districtName, wardName, weightGrams, subtotal, orderCode,
        ok: false, ...out, latencyMs: Date.now() - startedAt, rawResponse: feeJson,
      });
      return failResponse(out.reason, out.message);
    }

    const fee = feeJson.data?.total ?? 0;

    // Fetch real leadtime from GHN instead of hard-coding 2–4 days.
    let etaMin = 2;
    let etaMax = 4;
    try {
      const ltBody: Record<string, unknown> = {
        to_district_id: district.DistrictID,
        to_ward_code: ward.WardCode,
        service_id: serviceId ?? 0,
      };
      if (fromDistrictId) ltBody.from_district_id = fromDistrictId;
      const ltRes = await fetch(`${GHN_BASE}/v2/shipping-order/leadtime`, {
        method: "POST",
        headers: { Token: TOKEN, ShopId: String(shopId), "Content-Type": "application/json" },
        body: JSON.stringify(ltBody),
      });
      const ltJson = await ltRes.json();
      const ltSec = ltJson?.data?.leadtime as number | undefined; // unix seconds: estimated arrival
      if (ltRes.ok && ltJson.code === 200 && ltSec) {
        const days = leadtimeToEtaDays(ltSec);
        etaMin = days;
        etaMax = days;
      }
    } catch (e) {
      console.warn("GHN leadtime fetch failed, using default 2-4:", e);
    }

    void writeLog({
      provinceName, districtName, wardName, weightGrams, subtotal, orderCode,
      ok: true, fee, etaMin, etaMax, serviceId: serviceId ?? undefined,
      latencyMs: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({ ok: true, fee, etaDays: { min: etaMin, max: etaMax }, serviceId: serviceId ?? 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ghn-quote error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    if (parsedBody) {
      void writeLog({
        provinceName: parsedBody.provinceName,
        districtName: parsedBody.districtName,
        wardName: parsedBody.wardName,
        weightGrams: parsedBody.weightGrams,
        subtotal: parsedBody.subtotal,
        orderCode: parsedBody.orderCode,
        ok: false,
        reason: "ghn_error",
        message,
        latencyMs: Date.now() - startedAt,
      });
    }
    return failResponse("ghn_error", message);
  }
});
