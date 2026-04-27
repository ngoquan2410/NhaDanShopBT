// QR dialog for POS — lets cashier show a QR for the customer to scan when
// the selected paymentType is transfer / momo / zalopay. Uses VietQR for bank
// transfer (dynamic, embeds amount + content) and the static wallet QR images
// configured in StoreSettings for MoMo / ZaloPay.
//
// Pure presentation: receives amount + paymentType, fetches what it needs from
// the service layer. Cashier still confirms the invoice manually in POS.

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, Check, Copy } from "lucide-react";
import { storeSettings, vietQr } from "@/services";
import type { StorePaymentSettings, VietQrResult } from "@/services/types";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PosQrPaymentType = "transfer" | "momo" | "zalopay";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  paymentType: PosQrPaymentType;
  /** Short reference printed in the transfer content (e.g. invoice draft number). */
  reference?: string;
  /** Called when the cashier confirms the customer paid. */
  onConfirmPaid?: () => void;
}

const METHOD_LABEL: Record<PosQrPaymentType, string> = {
  transfer: "Chuyển khoản ngân hàng",
  momo: "Ví MoMo",
  zalopay: "Ví ZaloPay",
};

export function PosQrDialog({ open, onOpenChange, amount, paymentType, reference, onConfirmPaid }: Props) {
  const [settings, setSettings] = useState<StorePaymentSettings | null>(null);
  const [vietQrResult, setVietQrResult] = useState<VietQrResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load store settings + (for transfer) generate a fresh VietQR.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    setVietQrResult(null);
    (async () => {
      try {
        const s = await storeSettings.getPaymentSettings();
        if (cancel) return;
        setSettings(s);
        if (paymentType === "transfer") {
          const ref = reference || `POS${Date.now().toString().slice(-6)}`;
          const content = `${s.transferPrefix ?? "DH"} ${ref}`.trim();
          const r = await vietQr.generate({ amount, transferContent: content });
          if (!cancel) setVietQrResult(r);
        }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Không tạo được QR");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, paymentType, amount, reference, reloadKey]);

  const walletImage = useMemo(() => {
    if (!settings) return "";
    if (paymentType === "momo") return settings.momoQrImage ?? "";
    if (paymentType === "zalopay") return settings.zalopayQrImage ?? "";
    return "";
  }, [settings, paymentType]);

  const walletAccount = useMemo(() => {
    if (!settings) return { name: "", phone: "" };
    if (paymentType === "momo")
      return { name: settings.momoAccountName ?? "", phone: settings.momoPhone ?? "" };
    if (paymentType === "zalopay")
      return { name: settings.zalopayAccountName ?? "", phone: settings.zalopayPhone ?? "" };
    return { name: "", phone: "" };
  }, [settings, paymentType]);

  const walletMissing = (paymentType === "momo" || paymentType === "zalopay") && !walletImage;

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success(`Đã copy ${label}`));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR thanh toán — {METHOD_LABEL[paymentType]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">Số tiền cần thu</span>
            <span className="text-lg font-bold tabular-nums">{formatVND(amount)}</span>
          </div>

          {/* QR area */}
          <div className="flex flex-col items-center gap-2">
            {loading ? (
              <div className="h-72 w-72 flex items-center justify-center rounded-lg border bg-muted/30">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger-soft p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-danger" />
                <p className="text-sm text-danger">{error}</p>
                <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Thử lại
                </Button>
              </div>
            ) : walletMissing ? (
              <div className="h-72 w-72 flex flex-col items-center justify-center gap-2 rounded-lg border border-warning/40 bg-warning-soft p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-warning" />
                <p className="text-sm text-warning">
                  Chưa cấu hình ảnh QR {METHOD_LABEL[paymentType]}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Vào <span className="font-medium">Cài đặt cửa hàng → Ví điện tử</span> để tải ảnh QR.
                </p>
              </div>
            ) : paymentType === "transfer" && vietQrResult ? (
              <img
                src={vietQrResult.imageUrl}
                alt="QR chuyển khoản"
                className="h-72 w-72 rounded-lg border bg-white object-contain p-1"
              />
            ) : walletImage ? (
              <img
                src={walletImage}
                alt={`QR ${METHOD_LABEL[paymentType]}`}
                className="h-72 w-72 rounded-lg border bg-white object-contain p-1"
              />
            ) : null}
          </div>

          {/* Account details */}
          {!loading && !error && (
            <div className="space-y-1.5 text-sm">
              {paymentType === "transfer" && vietQrResult && (
                <>
                  <DetailRow label="Ngân hàng" value={vietQrResult.bankName} />
                  <DetailRow
                    label="Số tài khoản"
                    value={vietQrResult.accountNumber}
                    onCopy={() => copy(vietQrResult.accountNumber, "số tài khoản")}
                  />
                  <DetailRow label="Chủ tài khoản" value={vietQrResult.accountName} />
                  <DetailRow
                    label="Nội dung CK"
                    value={vietQrResult.transferContent}
                    onCopy={() => copy(vietQrResult.transferContent, "nội dung")}
                    mono
                  />
                </>
              )}
              {(paymentType === "momo" || paymentType === "zalopay") && !walletMissing && (
                <>
                  {walletAccount.name && <DetailRow label="Chủ ví" value={walletAccount.name} />}
                  {walletAccount.phone && (
                    <DetailRow
                      label="SĐT ví"
                      value={walletAccount.phone}
                      onCopy={() => copy(walletAccount.phone, "số điện thoại")}
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Khách nhập đúng số tiền <span className="font-semibold">{formatVND(amount)}</span> khi quét.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {onConfirmPaid && (
            <Button
              onClick={() => {
                onConfirmPaid();
                onOpenChange(false);
              }}
              disabled={walletMissing || !!error}
              className={cn("bg-success text-success-foreground hover:bg-success/90")}
            >
              <Check className="mr-1.5 h-4 w-4" /> Khách đã thanh toán
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className={cn("truncate text-sm font-medium", mono && "font-mono")}>{value}</span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
