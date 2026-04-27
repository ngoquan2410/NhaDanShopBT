// Goong proxy with strict free-tier protections.
// Endpoints proxied (REST API key only — no map tiles):
//   POST /functions/v1/goong-proxy  body: { op: "autocomplete", input, sessiontoken? }
//   POST /functions/v1/goong-proxy  body: { op: "detail", place_id }
//
// Protections:
//   - per-IP rate limit (in-memory, best-effort)
//   - server-side LRU cache (autocomplete keyed by normalized input, detail by place_id)
//   - daily + monthly soft caps; when reached, returns { quotaExceeded: true }
//   - never exposes GOONG_REST_API_KEY to the client

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const GOONG_KEY = Deno.env.get("GOONG_REST_API_KEY") ?? "";

// ---- Soft caps (well below Goong's free tier ~30k/mo, ~5 rps) ----
const DAILY_SOFT_CAP = 800;
const MONTHLY_SOFT_CAP = 20000;

// ---- Per-IP rate limit ----
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_PER_WINDOW = 12;

// ---- Cache TTLs ----
const AUTOCOMPLETE_TTL_MS = 10 * 60 * 1000; // 10 min
const DETAIL_TTL_MS = 60 * 60 * 1000;       // 1 hour
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry { value: unknown; expiresAt: number }
const acCache = new Map<string, CacheEntry>();
const detCache = new Map<string, CacheEntry>();

interface RateBucket { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>();

interface UsageState {
  dayKey: string;
  monthKey: string;
  daily: number;
  monthly: number;
}
const usage: UsageState = {
  dayKey: dayKey(new Date()),
  monthKey: monthKey(new Date()),
  daily: 0,
  monthly: 0,
};

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function rollUsage() {
  const now = new Date();
  const dk = dayKey(now);
  const mk = monthKey(now);
  if (usage.dayKey !== dk) { usage.dayKey = dk; usage.daily = 0; }
  if (usage.monthKey !== mk) { usage.monthKey = mk; usage.monthly = 0; }
}

function quotaExceeded(): boolean {
  rollUsage();
  return usage.daily >= DAILY_SOFT_CAP || usage.monthly >= MONTHLY_SOFT_CAP;
}

function bumpUsage() {
  rollUsage();
  usage.daily += 1;
  usage.monthly += 1;
}

function getCache(map: Map<string, CacheEntry>, key: string): unknown | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { map.delete(key); return null; }
  // refresh LRU position
  map.delete(key);
  map.set(key, hit);
  return hit.value;
}

function setCache(map: Map<string, CacheEntry>, key: string, value: unknown, ttl: number) {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, { value, expiresAt: Date.now() + ttl });
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || b.resetAt < now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  b.count += 1;
  return b.count <= RATE_MAX_PER_WINDOW;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!GOONG_KEY) {
    return jsonResponse({ error: "GOONG_REST_API_KEY not configured", quotaExceeded: false }, 500);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(ip)) {
    return jsonResponse({ error: "rate_limited", quotaExceeded: true }, 429);
  }

  let body: { op?: string; input?: string; place_id?: string; sessiontoken?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const op = body.op;

  if (op === "autocomplete") {
    const input = (body.input ?? "").trim();
    if (input.length < 4) return jsonResponse({ predictions: [] });
    const key = normalize(input);
    const cached = getCache(acCache, key);
    if (cached) return jsonResponse(cached);

    if (quotaExceeded()) {
      return jsonResponse({ quotaExceeded: true, predictions: [] }, 200);
    }
    // Dev test page: skip upstream entirely so quota is never burned on a cache miss.
    if (body.dryRun) {
      return jsonResponse({ predictions: [], dryRun: true, cached: false });
    }

    const url = new URL("https://rsapi.goong.io/v2/place/autocomplete");
    url.searchParams.set("input", input);
    url.searchParams.set("api_key", GOONG_KEY);
    url.searchParams.set("limit", "5");
    if (body.sessiontoken) url.searchParams.set("sessiontoken", body.sessiontoken);

    try {
      bumpUsage();
      const r = await fetch(url.toString());
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        // Treat 429 / quota errors from upstream as quota exceeded
        if (r.status === 429 || /quota|limit/i.test(text)) {
          return jsonResponse({ quotaExceeded: true, predictions: [] });
        }
        return jsonResponse({ error: "upstream_error", status: r.status }, 502);
      }
      const data = await r.json();
      const slim = {
        predictions: Array.isArray(data?.predictions)
          ? data.predictions.slice(0, 5).map((p: Record<string, unknown>) => ({
              place_id: p.place_id,
              description: p.description,
              structured_formatting: p.structured_formatting,
            }))
          : [],
      };
      setCache(acCache, key, slim, AUTOCOMPLETE_TTL_MS);
      return jsonResponse(slim);
    } catch (e) {
      return jsonResponse({ error: "network_error", message: String(e) }, 502);
    }
  }

  if (op === "detail") {
    const place_id = (body.place_id ?? "").trim();
    if (!place_id) return jsonResponse({ error: "missing_place_id" }, 400);
    const cached = getCache(detCache, place_id);
    if (cached) return jsonResponse(cached);

    if (quotaExceeded()) {
      return jsonResponse({ quotaExceeded: true }, 200);
    }
    if (body.dryRun) {
      return jsonResponse({ result: null, dryRun: true, cached: false });
    }

    const url = new URL("https://rsapi.goong.io/Place/Detail");
    url.searchParams.set("place_id", place_id);
    url.searchParams.set("api_key", GOONG_KEY);

    try {
      bumpUsage();
      const r = await fetch(url.toString());
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        if (r.status === 429 || /quota|limit/i.test(text)) {
          return jsonResponse({ quotaExceeded: true });
        }
        return jsonResponse({ error: "upstream_error", status: r.status }, 502);
      }
      const data = await r.json();
      const result = data?.result ?? data?.results?.[0] ?? null;
      const slim = {
        result: result
          ? {
              place_id: result.place_id,
              formatted_address: result.formatted_address,
              name: result.name,
              compound: result.compound, // { commune, district, province }
              geometry: result.geometry, // { location: { lat, lng } }
              address_components: result.address_components,
            }
          : null,
      };
      setCache(detCache, place_id, slim, DETAIL_TTL_MS);
      return jsonResponse(slim);
    } catch (e) {
      return jsonResponse({ error: "network_error", message: String(e) }, 502);
    }
  }

  return jsonResponse({ error: "unknown_op" }, 400);
});
