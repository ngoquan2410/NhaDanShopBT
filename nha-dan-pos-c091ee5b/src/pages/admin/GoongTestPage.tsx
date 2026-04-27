import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  fetchAddressAutocomplete,
  fetchAddressPlaceDetail,
} from "@/services/addresses/addressAutocompleteApi";
import {
  AddressAutocomplete,
  type GoongResolvedAddress,
  clearSessionFallback,
} from "@/components/shared/AddressAutocomplete";
import { Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin-only developer test page for Goong autocomplete + detail.
 * Diagnostics (request payloads, raw responses, cache/quota signals,
 * fallback session flag) are intentionally exposed ONLY here — never
 * surfaced in the customer checkout flow.
 */

interface Preset {
  label: string;
  input: string;
  hint?: string;
}

const PRESETS: Preset[] = [
  { label: "Hà Nội — Hoàn Kiếm", input: "12 Hàng Bài, Hoàn Kiếm, Hà Nội" },
  { label: "TP.HCM — Quận 1", input: "27 Lê Lợi, Bến Nghé, Quận 1, TP Hồ Chí Minh" },
  { label: "Đà Nẵng — Hải Châu", input: "100 Nguyễn Văn Linh, Hải Châu, Đà Nẵng" },
  {
    label: "Edge case — thiếu phường",
    input: "Khu công nghiệp Sóng Thần, Dĩ An, Bình Dương",
    hint: "Goong thường không trả về commune/phường cho khu công nghiệp.",
  },
];

function CopyButton({ payload, label = "Copy JSON" }: { payload: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (payload === null || payload === undefined) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
          setCopied(true);
          toast.success("Đã copy JSON vào clipboard");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Không copy được — clipboard bị chặn?");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
      {label}
    </Button>
  );
}

export default function GoongTestPage() {
  const [dryRun, setDryRun] = useState(true);
  const [acInput, setAcInput] = useState("");
  const [acResp, setAcResp] = useState<unknown>(null);
  const [acLoading, setAcLoading] = useState(false);

  const [placeId, setPlaceId] = useState("");
  const [detResp, setDetResp] = useState<unknown>(null);
  const [detLoading, setDetLoading] = useState(false);

  const [resolved, setResolved] = useState<GoongResolvedAddress | null>(null);

  const callAutocomplete = async (q?: string) => {
    const query = (q ?? acInput).trim();
    if (!query) return;
    setAcInput(query);
    setAcLoading(true);
    setAcResp(null);
    try {
      const data = await fetchAddressAutocomplete(query, { dryRun });
      setAcResp(data);
    } catch (e) {
      setAcResp({ error: String(e) });
    } finally {
      setAcLoading(false);
    }
  };

  const callDetail = async (id?: string) => {
    const pid = (id ?? placeId).trim();
    if (!pid) return;
    setPlaceId(pid);
    setDetLoading(true);
    setDetResp(null);
    try {
      const data = await fetchAddressPlaceDetail(pid, { dryRun });
      setDetResp(data);
    } catch (e) {
      setDetResp({ error: String(e) });
    } finally {
      setDetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goong API — Trang test (admin)"
        description="Diagnostics & quota debug. Chế độ Dry-run KHÔNG burn quota Goong khi cache miss."
      />

      <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Dry-run (không gọi Goong upstream)</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Khi bật: chỉ trả kết quả từ cache server, KHÔNG burn quota Goong. Tắt để gọi thật.
          </p>
        </div>
        <Switch checked={dryRun} onCheckedChange={setDryRun} />
      </div>

      {/* Preset library */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Sample inputs (1-click fill & run)</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <div key={p.label} className="flex items-start justify-between gap-2 p-2.5 rounded-lg border bg-muted/30">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{p.input}</p>
                {p.hint && <p className="text-[11px] text-warning-foreground mt-0.5">{p.hint}</p>}
              </div>
              <Button size="sm" onClick={() => callAutocomplete(p.input)}>
                Fill & Run
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearSessionFallback();
            toast.success("Đã clear session fallback. Reload để thử lại.");
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Clear session fallback
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Raw autocomplete */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">1. Autocomplete (raw)</h3>
            <CopyButton payload={acResp} />
          </div>
          <div className="flex gap-2">
            <Input
              value={acInput}
              onChange={(e) => setAcInput(e.target.value)}
              placeholder="VD: 12 Le Loi Ho Chi Minh"
            />
            <Button onClick={() => callAutocomplete()} disabled={acLoading}>
              {acLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gọi"}
            </Button>
          </div>
          <pre className="text-[11px] bg-muted/50 rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap break-all">
            {acResp ? JSON.stringify(acResp, null, 2) : "—"}
          </pre>
          {acResp && typeof acResp === "object" && "predictions" in (acResp as Record<string, unknown>) && (
            <div className="flex flex-wrap gap-1.5">
              {((acResp as { predictions?: Array<{ place_id: string; description: string }> }).predictions ?? [])
                .slice(0, 5)
                .map((p) => (
                  <Button
                    key={p.place_id}
                    size="sm"
                    variant="outline"
                    onClick={() => callDetail(p.place_id)}
                    title={p.description}
                  >
                    → Detail: {p.place_id.slice(0, 10)}…
                  </Button>
                ))}
            </div>
          )}
        </section>

        {/* Raw detail */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">2. Place Detail (raw)</h3>
            <CopyButton payload={detResp} />
          </div>
          <div className="flex gap-2">
            <Input
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              placeholder="place_id"
            />
            <Button onClick={() => callDetail()} disabled={detLoading}>
              {detLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gọi"}
            </Button>
          </div>
          <pre className="text-[11px] bg-muted/50 rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap break-all">
            {detResp ? JSON.stringify(detResp, null, 2) : "—"}
          </pre>
        </section>
      </div>

      {/* End-to-end widget */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">3. End-to-end widget (giống Checkout)</h3>
          <CopyButton payload={resolved} label="Copy resolved JSON" />
        </div>
        <p className="text-xs text-muted-foreground">
          Bỏ qua flag fallback đã lưu trong session để test sạch. {dryRun ? "Đang Dry-run." : "Live."}
        </p>
        <AddressAutocomplete
          dryRun={dryRun}
          ignoreSessionFallback
          onResolved={(r) => setResolved(r)}
        />
        <pre className="text-[11px] bg-muted/50 rounded-lg p-3 max-h-80 overflow-auto whitespace-pre-wrap break-all">
          {resolved ? JSON.stringify(resolved, null, 2) : "Chưa chọn gợi ý nào."}
        </pre>
      </section>
    </div>
  );
}
