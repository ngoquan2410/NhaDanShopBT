import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Unified toast provider for both admin & storefront.
 * - Admin (path bắt đầu bằng /admin): top-center, font lớn, dễ đọc.
 * - Storefront: top-center, kích thước vừa phải, không bị header che.
 * - Có nút đóng (X), error giữ lâu hơn success.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const update = () => setIsAdmin(window.location.pathname.startsWith("/admin"));
    update();
    window.addEventListener("popstate", update);
    // patch pushState để cập nhật khi SPA điều hướng
    const orig = window.history.pushState;
    window.history.pushState = function (...args) {
      const r = orig.apply(this, args);
      update();
      return r;
    };
    return () => {
      window.removeEventListener("popstate", update);
      window.history.pushState = orig;
    };
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      closeButton
      richColors
      expand
      visibleToasts={4}
      offset={isAdmin ? 24 : 80}
      toastOptions={{
        duration: 4000,
        style: {
          maxWidth: "calc(100vw - 24px)",
        },
        classNames: {
          toast: [
            "group toast relative",
            "group-[.toaster]:bg-background group-[.toaster]:text-foreground",
            "group-[.toaster]:border-border group-[.toaster]:shadow-2xl",
            "group-[.toaster]:rounded-xl",
            "group-[.toaster]:pr-10",
            isAdmin
              ? "group-[.toaster]:text-[15px] group-[.toaster]:p-4 group-[.toaster]:min-w-[320px] sm:group-[.toaster]:min-w-[360px]"
              : "group-[.toaster]:text-sm group-[.toaster]:p-3.5",
          ].join(" "),
          title: "font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: [
            "group-[.toast]:!left-auto group-[.toast]:!right-2 group-[.toast]:!top-2",
            "group-[.toast]:!translate-x-0 group-[.toast]:!translate-y-0",
            "group-[.toast]:bg-background group-[.toast]:border-border",
            "group-[.toast]:hover:bg-muted",
          ].join(" "),
          error: "",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
