const SHIPPING_ZONE_LABELS: Record<string, string> = {
  LOCAL_MO_CAY: "Mỏ Cày",
};

export function formatShippingZoneLabel(zoneCode?: string | null): string | null {
  const raw = zoneCode?.trim();
  if (!raw) return null;
  if (raw === "LOCAL_MO_CAY") return "Mỏ Cày";

  const mapped = SHIPPING_ZONE_LABELS[raw];
  if (mapped) return mapped;

  return raw
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
