import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Unified GLOBAL toast provider for both admin & storefront.
 *
 * UI-only:
 * - Single global Toaster, top-right, max 3 visible, not expanded.
 * - Variant background applied to the TOAST ROOT (success/error/warning/info).
 * - Close button stays neutral (slate hover).
 * - Width capped (~420px desktop, viewport-safe on mobile).
 * - Fixed safe offset so toasts don't collide with sticky header.
 *
 * Does NOT detect routes, does NOT monkey-patch window.history.
 */
const variantBase =
  "group toast relative border shadow-md rounded-xl pr-10 text-sm p-3.5";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      expand={false}
      visibleToasts={3}
      closeButton
      offset={72}
      toastOptions={{
        duration: 4000,
        style: {
          maxWidth: "min(420px, calc(100vw - 24px))",
          width: "100%",
        },
        classNames: {
          toast: `${variantBase} bg-slate-50 border-slate-200 text-slate-900`,
          title: "font-semibold",
          description: "opacity-80",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: `${variantBase} bg-green-50 border-green-200 text-green-900`,
          error: `${variantBase} bg-red-50 border-red-200 text-red-900`,
          warning: `${variantBase} bg-yellow-50 border-yellow-200 text-yellow-900`,
          info: `${variantBase} bg-blue-50 border-blue-200 text-blue-900`,
          closeButton: [
            "group-[.toast]:!left-auto group-[.toast]:!right-2 group-[.toast]:!top-2",
            "group-[.toast]:!translate-x-0 group-[.toast]:!translate-y-0",
            "group-[.toast]:!bg-white group-[.toast]:!border-slate-200",
            "group-[.toast]:!text-slate-500",
            "group-[.toast]:hover:!text-slate-800 group-[.toast]:hover:!bg-slate-100",
          ].join(" "),
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
