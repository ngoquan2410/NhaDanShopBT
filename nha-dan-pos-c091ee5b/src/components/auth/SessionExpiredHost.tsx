import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SESSION_EXPIRED_EVENT, type SessionExpiredDetail } from "@/lib/sessionExpiryEvents";

/**
 * Central modal when refresh token fails or backend returns persistent 401 — replaces silent redirects/toasts only.
 */
export function SessionExpiredHost() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SessionExpiredDetail>).detail;
      setNextPath(detail?.nextPath && detail.nextPath.length > 0 ? detail.nextPath : "/");
      setOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const loginHref = `/login?next=${encodeURIComponent(nextPath || "/")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className="sm:max-w-md" data-testid="session-expired-modal" onPointerDownOutside={(ev) => ev.preventDefault()} onInteractOutside={(ev) => ev.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Phiên đăng nhập hết hạn</DialogTitle>
          <DialogDescription>
            Phiên làm việc của bạn đã kết thúc hoặc không còn hiệu lực. Vui lòng đăng nhập lại để tiếp tục.{` `}
            Trang khách sau đăng nhập sẽ trở lại đúng nơi bạn đang thao tác (nếu được phép).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            data-testid="session-expired-login"
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
            onClick={() => {
              setOpen(false);
              navigate(loginHref);
            }}
          >
            Đăng nhập lại
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
