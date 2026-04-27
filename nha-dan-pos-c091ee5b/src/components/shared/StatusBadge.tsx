import { cn } from "@/lib/utils";

type StatusType =
  | 'active' | 'inactive'
  | 'in-stock' | 'low-stock' | 'out-of-stock'
  | 'near-expiry' | 'expired'
  | 'pending' | 'confirmed' | 'cancelled' | 'expired-order'
  | 'draft'
  | 'totp-enabled' | 'totp-disabled'
  | 'import-ready' | 'import-warning' | 'import-error'
  | 'cash' | 'transfer' | 'momo' | 'zalopay'
  | 'vip' | 'wholesale' | 'retail';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  'active': { label: 'Hoạt động', className: 'bg-success-soft text-success' },
  'inactive': { label: 'Ngưng', className: 'bg-muted text-muted-foreground' },
  'in-stock': { label: 'Còn hàng', className: 'bg-success-soft text-success' },
  'low-stock': { label: 'Sắp hết', className: 'bg-warning-soft text-warning' },
  'out-of-stock': { label: 'Hết hàng', className: 'bg-danger-soft text-danger' },
  'near-expiry': { label: 'Sắp hết hạn', className: 'bg-warning-soft text-warning' },
  'expired': { label: 'Đã hết hạn', className: 'bg-danger-soft text-danger' },
  'pending': { label: 'Chờ xác nhận', className: 'bg-warning-soft text-warning' },
  'confirmed': { label: 'Đã xác nhận', className: 'bg-success-soft text-success' },
  'cancelled': { label: 'Đã hủy', className: 'bg-danger-soft text-danger' },
  'expired-order': { label: 'Hết hạn', className: 'bg-muted text-muted-foreground' },
  'draft': { label: 'Nháp', className: 'bg-info-soft text-info' },
  'totp-enabled': { label: 'Đã bật', className: 'bg-success-soft text-success' },
  'totp-disabled': { label: 'Chưa bật', className: 'bg-muted text-muted-foreground' },
  'import-ready': { label: 'Sẵn sàng', className: 'bg-success-soft text-success' },
  'import-warning': { label: 'Cảnh báo', className: 'bg-warning-soft text-warning' },
  'import-error': { label: 'Lỗi', className: 'bg-danger-soft text-danger' },
  'cash': { label: 'Tiền mặt', className: 'bg-success-soft text-success' },
  'transfer': { label: 'Chuyển khoản', className: 'bg-info-soft text-info' },
  'momo': { label: 'MoMo', className: 'bg-[hsl(330,70%,95%)] text-[hsl(330,70%,40%)]' },
  'zalopay': { label: 'ZaloPay', className: 'bg-info-soft text-info' },
  'vip': { label: 'VIP', className: 'bg-accent-soft text-accent' },
  'wholesale': { label: 'Sỉ', className: 'bg-info-soft text-info' },
  'retail': { label: 'Lẻ', className: 'bg-muted text-muted-foreground' },
};

export function StatusBadge({ status, label, className, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn(
      "inline-flex items-center font-medium rounded-full whitespace-nowrap",
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      config.className,
      className
    )}>
      {label || config.label}
    </span>
  );
}
