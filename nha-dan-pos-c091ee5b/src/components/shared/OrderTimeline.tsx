// Shared invoice/order status timeline.
// Renders distinct steps for COD (cash) vs online payments (bank_transfer / momo / zalopay)
// so cashiers and customers can see exactly where the order is.
//
// Used by:
//  - storefront /pending-payment/:id
//  - admin /admin/pending-orders detail drawer

import { Calendar, Clock, CreditCard, CheckCircle2, XCircle, Truck, Banknote, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentMethod, PendingOrderStatus } from "@/services/types";

export type TimelineVariant = "default" | "success" | "danger" | "warning";

export interface TimelineStep {
  id: string;
  label: string;
  icon: LucideIcon;
  done: boolean;
  current?: boolean;
  variant?: TimelineVariant;
  time?: string;
  hint?: string;
}

interface BuildArgs {
  paymentMethod: PaymentMethod;
  status: PendingOrderStatus;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Build the canonical step list for an order.
 *
 * COD (cash):
 *   created → out for delivery → cash collected (invoice) → completed
 * Bank / wallet:
 *   created → awaiting payment → payment confirmed (invoice) → completed
 */
export function buildOrderTimeline({ paymentMethod, status, createdAt, expiresAt }: BuildArgs): TimelineStep[] {
  const isCash = paymentMethod === "cash";
  const isPending = status === "pending_payment";
  const isWaiting = status === "waiting_confirm";
  const isPaidAuto = status === "paid_auto";
  const isConfirmed = status === "confirmed";
  const isCancelled = status === "cancelled";

  const created: TimelineStep = {
    id: "created",
    label: "Đã đặt đơn",
    icon: Calendar,
    done: true,
    time: createdAt,
  };

  // Mutually-exclusive `current` between middle and settle:
  //  - pending_payment  → middle is current, settle is upcoming
  //  - waiting_confirm  → middle is done,    settle is current
  //  - confirmed        → both done
  //  - cancelled        → flagged on settle
  const middle: TimelineStep = isCash
    ? {
        id: "out_for_delivery",
        label: "Đang chuẩn bị & giao hàng",
        icon: Truck,
        done: isWaiting || isPaidAuto || isConfirmed,
        current: isPending,
        hint: isPending ? "Shipper sẽ thu tiền mặt khi giao" : undefined,
      }
    : {
        id: "awaiting_payment",
        label: "Chờ thanh toán",
        icon: Clock,
        done: isWaiting || isPaidAuto || isConfirmed,
        current: isPending,
        hint: isPending && expiresAt ? `Hết hạn: ${formatDateTime(expiresAt)}` : undefined,
      };

  const settle: TimelineStep = isCash
    ? {
        id: "cash_collected",
        label: isConfirmed ? "Đã thu tiền · Hóa đơn đã lập" : isCancelled ? "Đã hủy" : "Chờ thu tiền mặt",
        icon: isCancelled ? XCircle : Banknote,
        done: isConfirmed,
        current: isWaiting || isPaidAuto,
        variant: isConfirmed ? "success" : isCancelled ? "danger" : undefined,
        hint: isWaiting ? "Shipper đã giao, đang chờ kế toán đối soát" : undefined,
      }
    : {
        id: "payment_confirmed",
        label:
          isConfirmed ? "Thanh toán đã xác nhận · Hóa đơn đã lập"
          : isCancelled ? "Đã hủy"
          : isPaidAuto ? "Đã nhận thanh toán · Chờ xác nhận đơn"
          : "Chờ admin xác nhận",
        icon: isCancelled ? XCircle : CreditCard,
        done: isConfirmed,
        current: isWaiting || isPaidAuto,
        variant: isConfirmed ? "success" : isCancelled ? "danger" : undefined,
        hint:
          isPaidAuto ? "Thanh toán đã được đối soát, chờ cửa hàng xác nhận đơn"
          : isWaiting ? "Khách đã chuyển khoản, chờ admin đối soát"
          : undefined,
      };

  const completed: TimelineStep = {
    id: "completed",
    label: isCancelled ? "Đơn đã hủy" : isConfirmed ? "Hoàn tất" : "Hoàn tất",
    icon: isCancelled ? XCircle : isConfirmed ? CheckCircle2 : Package,
    done: isConfirmed,
    variant: isCancelled ? "danger" : isConfirmed ? "success" : undefined,
  };

  return [created, middle, settle, completed];
}

interface Props {
  paymentMethod: PaymentMethod;
  status: PendingOrderStatus;
  createdAt: string;
  expiresAt?: string;
  /** Compact horizontal layout (used in storefront header). Default vertical. */
  layout?: "vertical" | "horizontal";
  className?: string;
}

export function OrderTimeline({ paymentMethod, status, createdAt, expiresAt, layout = "vertical", className }: Props) {
  const steps = buildOrderTimeline({ paymentMethod, status, createdAt, expiresAt });

  if (layout === "horizontal") {
    return (
      <div className={cn("flex items-start justify-between gap-2", className)}>
        {steps.map((step, i) => {
          const Icon = step.icon;
          const tone =
            step.variant === "success" ? "bg-success-soft text-success border-success/30"
            : step.variant === "danger" ? "bg-danger-soft text-danger border-danger/30"
            : step.done ? "bg-primary-soft text-primary border-primary/30"
            : step.current ? "bg-warning-soft text-warning border-warning/30 animate-pulse-soft"
            : "bg-muted text-muted-foreground border-border";
          const labelTone =
            step.variant === "success" ? "text-success"
            : step.variant === "danger" ? "text-danger"
            : step.done ? "text-foreground"
            : step.current ? "text-warning"
            : "text-muted-foreground";
          return (
            <div key={step.id} className="flex-1 flex flex-col items-center text-center min-w-0">
              <div className={cn("h-7 w-7 rounded-full flex items-center justify-center border", tone)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={cn("mt-1 text-[10px] font-semibold leading-tight", labelTone)}>
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={cn(
                  "absolute h-0.5 w-full top-3 left-1/2",
                )} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {steps.map((step, i) => {
        const Icon = step.icon;
        const tone =
          step.variant === "success" ? "bg-success-soft text-success"
          : step.variant === "danger" ? "bg-danger-soft text-danger"
          : step.done ? "bg-primary-soft text-primary"
          : step.current ? "bg-warning-soft text-warning animate-pulse-soft"
          : "bg-muted text-muted-foreground";
        const labelTone =
          step.variant === "success" ? "text-success"
          : step.variant === "danger" ? "text-danger"
          : step.done || step.current ? "text-foreground"
          : "text-muted-foreground";
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0", tone)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {i < steps.length - 1 && (
                <div className={cn("w-0.5 flex-1 mt-1", step.done ? "bg-primary/30" : "bg-border")} />
              )}
            </div>
            <div className="flex-1 pt-0.5 pb-2">
              <p className={cn("text-sm font-medium", labelTone)}>{step.label}</p>
              {step.time && <p className="text-xs text-muted-foreground">{formatDateTime(step.time)}</p>}
              {step.hint && <p className="text-xs text-muted-foreground">{step.hint}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
