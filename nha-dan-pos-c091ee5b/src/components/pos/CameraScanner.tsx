import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { Camera as CameraIcon, RefreshCw, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "scanning"
  | "success"
  | "denied"
  | "unavailable"
  | "insecure"
  | "error";

interface CameraScannerProps {
  active: boolean;
  onDetected: (code: string) => void;
  onClose?: () => void;
  /** ms to suppress identical successive scans */
  duplicateWindowMs?: number;
}

/**
 * Real camera barcode scanner using @zxing/browser.
 * - Real getUserMedia permission flow with explicit prompts
 * - Prefers rear camera (facingMode: environment) on mobile
 * - iOS Safari friendly: playsInline + explicit video.play()
 * - Surfaces HTTPS / denied / not-found / generic errors clearly
 * - Releases media stream on unmount, when active=false, or on stop
 * - Suppresses duplicate frames of the same code
 */
export function CameraScanner({
  active,
  onDetected,
  onClose,
  duplicateWindowMs = 1500,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [retryTick, setRetryTick] = useState(0);

  // Stop any in-flight stream cleanly + clear video element
  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* noop */
    }
    controlsRef.current = null;
    const v = videoRef.current;
    if (v) {
      try {
        const stream = v.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
      v.srcObject = null;
    }
  }, []);

  // Enumerate cameras after permission granted
  const loadDevices = useCallback(
    async (preferRearIfNoneSelected: boolean) => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(list);
        if (preferRearIfNoneSelected && !deviceId && list.length) {
          const rear = list.find((d) => /back|rear|environment/i.test(d.label));
          setDeviceId((rear || list[0]).deviceId);
        }
      } catch {
        /* ignore */
      }
    },
    [deviceId]
  );

  useEffect(() => {
    if (!active) {
      stop();
      setStatus("idle");
      return;
    }

    // Hard requirement: secure context (HTTPS or localhost) — iOS especially strict
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("insecure");
      setErrorMsg("Camera chỉ hoạt động trên HTTPS hoặc localhost.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setErrorMsg("Trình duyệt không hỗ trợ truy cập camera.");
      return;
    }

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      setStatus("requesting");
      setErrorMsg("");

      try {
        // Permission probe — use facingMode unless a specific device was already chosen
        const probeConstraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
        };
        const probe = await navigator.mediaDevices.getUserMedia(probeConstraints);
        // Stop probe tracks — zxing opens its own stream
        probe.getTracks().forEach((t) => t.stop());

        await loadDevices(true);
        if (cancelled) return;

        const v = videoRef.current;
        if (!v) return;

        // iOS Safari: must be set BEFORE play so it doesn't fullscreen
        v.setAttribute("playsinline", "true");
        v.muted = true;

        setStatus("ready");

        const controls = await reader.decodeFromVideoDevice(
          deviceId, // undefined → zxing picks default (env preferred via constraints)
          v,
          (result) => {
            if (!result) return;
            const code = result.getText();
            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.code === code && now - last.at < duplicateWindowMs) {
              return;
            }
            lastScanRef.current = { code, at: now };
            setStatus("success");
            onDetected(code);
            // Drop back to scanning after brief success flash
            if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
            successTimerRef.current = window.setTimeout(() => {
              setStatus((s) => (s === "success" ? "scanning" : s));
            }, 600);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;

        // iOS Safari sometimes leaves video paused — kick it
        try {
          if (v.paused) await v.play();
        } catch {
          /* autoplay may still fail silently — preview will appear once user interacts */
        }
        if (!cancelled) setStatus("scanning");
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
          setStatus("denied");
          setErrorMsg("Camera chưa được cấp quyền.");
        } else if (
          e?.name === "NotFoundError" ||
          e?.name === "OverconstrainedError" ||
          e?.name === "DevicesNotFoundError"
        ) {
          setStatus("unavailable");
          setErrorMsg("Không phát hiện thiết bị camera.");
        } else if (e?.name === "NotReadableError" || e?.name === "TrackStartError") {
          setStatus("error");
          setErrorMsg("Camera đang được ứng dụng khác sử dụng.");
        } else {
          setStatus("error");
          setErrorMsg(e?.message || "Không thể khởi động camera.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, deviceId, retryTick]);

  // Stop on unmount as a safety net
  useEffect(() => () => stop(), [stop]);

  const statusLabel: Record<CameraStatus, string> = {
    idle: "",
    requesting: "Đang xin quyền camera...",
    ready: "Camera đã sẵn sàng",
    scanning: "Đang quét...",
    success: "Quét thành công",
    denied: "Camera chưa được cấp quyền",
    unavailable: "Không phát hiện thiết bị camera",
    insecure: "Cần HTTPS để dùng camera",
    error: errorMsg || "Lỗi camera",
  };

  const isErrorState =
    status === "denied" ||
    status === "unavailable" ||
    status === "insecure" ||
    status === "error";

  return (
    <div className="rounded-md border bg-background overflow-hidden">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />
        {(status === "ready" || status === "scanning" || status === "success") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "w-3/4 h-1/3 border-2 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors",
                status === "success" ? "border-success" : "border-primary/80"
              )}
            />
          </div>
        )}
        {status === "success" && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-success text-success-foreground text-[11px] font-medium">
            <CheckCircle2 className="h-3 w-3" /> Quét thành công
          </div>
        )}
        {isErrorState && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-3 bg-black/60">
            <AlertTriangle className="h-6 w-6 text-danger" />
            <p className="text-xs text-white max-w-[80%]">{statusLabel[status]}</p>
            {status === "denied" && (
              <p className="text-[10px] text-white/70 max-w-[80%]">
                Mở cài đặt trình duyệt → cấp quyền camera cho trang này, sau đó bấm Thử lại.
              </p>
            )}
          </div>
        )}
        {status === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-white/90">Đang xin quyền camera...</p>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white hover:bg-black/70"
            title="Đóng camera"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-2 text-[11px]">
        <div
          className={cn(
            "flex items-center gap-1.5 truncate",
            isErrorState
              ? "text-danger"
              : status === "success"
              ? "text-success"
              : "text-muted-foreground"
          )}
        >
          <CameraIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{statusLabel[status]}</span>
        </div>
        {devices.length > 1 && (
          <select
            value={deviceId || ""}
            onChange={(e) => setDeviceId(e.target.value)}
            className="h-6 text-[11px] bg-muted rounded px-1 max-w-[40%]"
            title="Chọn camera"
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}
        {isErrorState && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg("");
              setRetryTick((n) => n + 1);
            }}
            className="flex items-center gap-1 px-1.5 h-6 rounded border hover:bg-muted"
            title="Thử lại"
          >
            <RefreshCw className="h-3 w-3" /> Thử lại
          </button>
        )}
      </div>
    </div>
  );
}
