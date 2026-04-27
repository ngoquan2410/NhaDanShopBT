const FETCH_TIMEOUT_MS = 8000;

export interface AddressAutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

export interface AddressAutocompleteResponse {
  quotaExceeded?: boolean;
  predictions?: AddressAutocompletePrediction[];
  dryRun?: boolean;
  cached?: boolean;
}

export interface AddressPlaceDetailResponse {
  quotaExceeded?: boolean;
  result?: {
    place_id?: string;
    formatted_address?: string;
    name?: string;
    compound?: {
      province?: string;
      district?: string;
      commune?: string;
    };
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    address_components?: unknown;
  } | null;
  dryRun?: boolean;
  cached?: boolean;
}

async function requestJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok && !data?.quotaExceeded) {
      throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    }
    return data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchAddressAutocomplete(
  input: string,
  opts?: { dryRun?: boolean },
): Promise<AddressAutocompleteResponse> {
  const url = new URL("/api/address-autocomplete", window.location.origin);
  url.searchParams.set("input", input);
  if (opts?.dryRun) {
    url.searchParams.set("dryRun", "true");
  }
  return requestJson<AddressAutocompleteResponse>(url.toString());
}

export async function fetchAddressPlaceDetail(
  placeId: string,
  opts?: { dryRun?: boolean },
): Promise<AddressPlaceDetailResponse> {
  const url = new URL("/api/address-place-detail", window.location.origin);
  url.searchParams.set("placeId", placeId);
  if (opts?.dryRun) {
    url.searchParams.set("dryRun", "true");
  }
  return requestJson<AddressPlaceDetailResponse>(url.toString());
}
