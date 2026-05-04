import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatVND, formatDate } from "@/lib/format";
import { useService } from "@/hooks/useService";
import { adminReports, inventory, invoices, pendingOrders } from "@/services";
import type { PendingOrder } from "@/services/types";
import type { ReactNode } from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Package,
  FileInput,
  ClipboardCheck,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  startOfWeek,
  subWeeks,
  addDays,
  differenceInCalendarDays,
  startOfMonth,
  subMonths,
} from "date-fns";

const EXPIRY_SOON_DAYS = 30;

type StatTrend = { value: string; positive: boolean };

/** Local calendar YYYY-MM-DD (avoids UTC day skew from {@link Date#toISOString}). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Period-over-period %; returns nothing when denominator is zero (empty DB / no baseline). */
function pctTrendVersusPrev(prev: number, curr: number): StatTrend | undefined {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return undefined;
  if (prev === 0) return undefined;
  const pct = ((curr - prev) / prev) * 100;
  const decimals = Math.abs(pct) >= 100 ? 0 : 1;
  const rounded =
    decimals === 0 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return { value: `${sign}${rounded}%`, positive: pct >= 0 };
}

function parseYmd(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function AdminDashboard() {
  const today = new Date();
  const todayStr = localYmd(today);
  const monthStartDate = startOfMonth(today);
  const monthStartStr = localYmd(monthStartDate);

  /** Monday-start week — comparable slice vs same weekdays last week */
  const weekStartMon = startOfWeek(today, { weekStartsOn: 1 });
  const weekStartStr = localYmd(weekStartMon);
  const weekdaysSinceWeekStart = differenceInCalendarDays(today, weekStartMon);

  const prevWeekMon = subWeeks(weekStartMon, 1);
  const prevWeekStartStr = localYmd(prevWeekMon);
  const prevWeekEndComparableStr = localYmd(addDays(prevWeekMon, weekdaysSinceWeekStart));

  /** MTD vs same calendar span in prior month */
  const prevMonthFirst = startOfMonth(subMonths(today, 1));
  const mtdSpanDays = differenceInCalendarDays(today, monthStartDate) + 1;
  const prevMonthStartStr = localYmd(prevMonthFirst);
  const prevMonthEndComparableStr = localYmd(addDays(prevMonthFirst, mtdSpanDays - 1));

  const { data, loading, error } = useService(async () => {
    const [
      profitMonthRows,
      profitWeekRows,
      profitPrevWeekRows,
      profitPrevMonthRows,
      inventoryRows,
      invoicePage,
      pendingPage,
    ] = await Promise.all([
      adminReports.profit(monthStartStr, todayStr),
      adminReports.profit(weekStartStr, todayStr),
      adminReports.profit(prevWeekStartStr, prevWeekEndComparableStr),
      adminReports.profit(prevMonthStartStr, prevMonthEndComparableStr),
      inventory.listInventoryProjections(),
      invoices.list({ page: 1, pageSize: 1 }),
      pendingOrders.list({ page: 1, pageSize: 12, sort: [{ field: "createdAt", direction: "desc" }] }),
    ]);
    const profitZero = { revenue: 0, profit: 0 };
    const profitW = profitWeekRows[0] ?? profitZero;
    const profitM = profitMonthRows[0] ?? profitZero;
    const profitPrevW = profitPrevWeekRows[0] ?? profitZero;
    const profitPrevM = profitPrevMonthRows[0] ?? profitZero;

    const trendWeekRevenue = pctTrendVersusPrev(profitPrevW.revenue, profitW.revenue);
    const trendWeekProfit = pctTrendVersusPrev(profitPrevW.profit, profitW.profit);
    const trendMonthRevenue = pctTrendVersusPrev(profitPrevM.revenue, profitM.revenue);
    const trendMonthProfit = pctTrendVersusPrev(profitPrevM.profit, profitM.profit);

    const lowStock: Array<{ productName: string; variantName: string; stock: number; minStock: number }> = [];
    const outOfStock: Array<{ productName: string; variantName: string }> = [];
    const expirySoon: Array<{ productName: string; variantName: string; expiryDate: string; lotCode?: string }> = [];
    const expiryExpired: Array<{ productName: string; variantName: string; expiryDate: string; lotCode?: string }> = [];

    const t0 = startOfDay(today);
    const soonUntil = addDays(t0, EXPIRY_SOON_DAYS);

    for (const v of inventoryRows) {
      // COMBO / ảo: BE không gán sellableQty; onHand có thể = 0 dù thành phần vẫn đủ hàng.
      const physicalStockRow = v.sellableQty != null;
      const avail = v.sellableQty ?? v.available ?? v.onHand ?? 0;
      const minStock = v.minStockQty ?? 10;
      const productName = v.productName ?? "";
      const variantName = v.variantName ?? v.variantCode ?? "";

      if (physicalStockRow) {
        if (avail <= 0) {
          outOfStock.push({ productName, variantName });
        } else if (avail > 0 && avail <= minStock) {
          lowStock.push({ productName, variantName, stock: avail, minStock });
        }
      }

      for (const b of v.byBatch ?? []) {
        const expRaw = b.expiryDate;
        if (!expRaw) continue;
        const exp = parseYmd(expRaw);
        if (!exp) continue;
        const row = {
          productName,
          variantName,
          expiryDate: expRaw.slice(0, 10),
          lotCode: b.batchCode ?? b.lotCode,
        };
        if (exp < t0) {
          expiryExpired.push(row);
        } else if (exp <= soonUntil) {
          expirySoon.push(row);
        }
      }
    }

    expirySoon.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    expiryExpired.sort((a, b) => b.expiryDate.localeCompare(a.expiryDate));

    const pendingOpen = (pendingPage.items as PendingOrder[]).filter(
      (o) => o.status === "pending_payment" || o.status === "waiting_confirm" || o.status === "paid_auto",
    );
    const recentPending = pendingPage.items.slice(0, 5) as PendingOrder[];

    return {
      revenueThisWeek: profitW.revenue,
      revenueThisMonth: profitM.revenue,
      profitThisWeek: profitW.profit,
      profitThisMonth: profitM.profit,
      trendWeekRevenue,
      trendWeekProfit,
      trendMonthRevenue,
      trendMonthProfit,
      invoiceCountApprox: invoicePage.total,
      pendingOrdersCount: pendingOpen.length,
      lowStockVariants: lowStock.slice(0, 6),
      lowStockCount: lowStock.length,
      outOfStockVariants: outOfStock.slice(0, 6),
      outOfStockCount: outOfStock.length,
      nearExpiryLots: expirySoon.slice(0, 6),
      nearExpiryCount: expirySoon.length,
      expiredLots: expiryExpired.slice(0, 6),
      expiredCount: expiryExpired.length,
      recentPending,
    };
  }, [monthStartStr, prevMonthEndComparableStr, prevMonthStartStr, prevWeekEndComparableStr, prevWeekStartStr, todayStr, weekStartStr]);

  const s = data ?? {
    revenueThisWeek: 0,
    revenueThisMonth: 0,
    profitThisWeek: 0,
    profitThisMonth: 0,
    invoiceCountApprox: 0,
    pendingOrdersCount: 0,
    lowStockVariants: [] as Array<{ productName: string; variantName: string; stock: number; minStock: number }>,
    lowStockCount: 0,
    outOfStockVariants: [] as Array<{ productName: string; variantName: string }>,
    outOfStockCount: 0,
    nearExpiryLots: [] as Array<{ productName: string; variantName: string; expiryDate: string; lotCode?: string }>,
    nearExpiryCount: 0,
    expiredLots: [] as Array<{ productName: string; variantName: string; expiryDate: string; lotCode?: string }>,
    expiredCount: 0,
    recentPending: [] as PendingOrder[],
    trendWeekRevenue: undefined as StatTrend | undefined,
    trendWeekProfit: undefined as StatTrend | undefined,
    trendMonthRevenue: undefined as StatTrend | undefined,
    trendMonthProfit: undefined as StatTrend | undefined,
  };

  return (
    <div className="space-y-5 admin-dense">
      <PageHeader title="Dashboard" description="Tổng quan hoạt động kinh doanh" />
      {loading && <p className="text-sm text-muted-foreground">Đang tải dashboard từ backend...</p>}
      {error && <p className="text-sm text-danger">Không tải được dashboard: {error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          title="Doanh thu tuần"
          value={formatVND(s.revenueThisWeek)}
          variant="primary"
          trend={s.trendWeekRevenue}
        />
        <StatCard
          icon={TrendingUp}
          title="Doanh thu tháng"
          value={formatVND(s.revenueThisMonth)}
          trend={s.trendMonthRevenue}
        />
        <StatCard
          icon={DollarSign}
          title="Lợi nhuận tuần"
          value={formatVND(s.profitThisWeek)}
          variant="success"
          trend={s.trendWeekProfit}
        />
        <StatCard
          icon={DollarSign}
          title="Lợi nhuận tháng"
          value={formatVND(s.profitThisMonth)}
          trend={s.trendMonthProfit}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold text-sm mb-3">Thao tác nhanh</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Tạo hóa đơn", icon: ShoppingCart, path: "/admin/pos", color: "bg-primary text-primary-foreground" },
              { label: "Tạo phiếu nhập", icon: FileInput, path: "/admin/goods-receipts/create", color: "bg-success text-success-foreground" },
              { label: "Đơn chờ TT", icon: Clock, path: "/admin/pending-orders", color: "bg-warning text-warning-foreground" },
              { label: "Kiểm kho", icon: ClipboardCheck, path: "/admin/stock-adjustments", color: "bg-info text-info-foreground" },
            ].map(a => (
              <Link key={a.path} to={a.path} className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-xs font-medium transition-opacity hover:opacity-90 ${a.color}`}>
                <a.icon className="h-4 w-4" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Đơn gần đây</h2>
            <StatusBadge status="pending" label={`${s.pendingOrdersCount} mở`} />
          </div>
          <div className="space-y-2">
            {s.recentPending.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Chưa có đơn chờ — khách tạo đơn sẽ hiển thị tại đây.</p>
            ) : (
              s.recentPending.map((o) => (
                <Link
                  key={o.id}
                  to="/admin/pending-orders"
                  className="flex items-center justify-between p-2 rounded-md border border-border/60 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium truncate">{o.code}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {o.customerName ?? "—"} · {formatVND(o.pricingBreakdownSnapshot?.total ?? 0)}
                    </p>
                  </div>
                  {statusMini(o.status)}
                </Link>
              ))
            )}
          </div>
          <Link to="/admin/pending-orders" className="mt-3 flex items-center gap-1 text-xs text-primary font-medium hover:underline">
            Xem tất cả <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold text-sm mb-3">Hôm nay</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hóa đơn (ước lượng)</span>
              <span className="font-bold">{s.invoiceCountApprox}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Doanh thu (kỳ báo cáo)</span>
              <span className="font-bold">{formatVND(s.revenueThisWeek)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Đơn chờ xử lý</span>
              <span className="font-bold text-warning">{s.pendingOrdersCount}</span>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Package className="h-4 w-4" /> Cảnh báo tồn kho &amp; HSD
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AlertListCard
          icon={AlertTriangle}
          iconClass="text-warning"
          title={`Sắp hết hàng (${s.lowStockCount})`}
          empty="Không có variant nào vượt ngưỡng tồn."
          rows={s.lowStockVariants.map((v, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 gap-2">
              <div className="min-w-0">
                <span className="font-medium">{v.productName}</span>
                <span className="text-muted-foreground"> — {v.variantName}</span>
              </div>
              <StatusBadge status="low-stock" label={`${v.stock}/${v.minStock}`} />
            </div>
          ))}
        />
        <AlertListCard
          icon={Package}
          iconClass="text-danger"
          title={`Hết hàng (${s.outOfStockCount})`}
          empty="Không có variant hết hàng."
          rows={s.outOfStockVariants.map((v, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <div className="min-w-0">
                <span className="font-medium">{v.productName}</span>
                <span className="text-muted-foreground"> — {v.variantName}</span>
              </div>
              <StatusBadge status="out-of-stock" />
            </div>
          ))}
        />
        <AlertListCard
          icon={CalendarClock}
          iconClass="text-warning"
          title={`Sắp hết HSD (${s.nearExpiryCount})`}
          subtitle={`Trong ${EXPIRY_SOON_DAYS} ngày, chưa quá hạn.`}
          empty="Không có lô sắp hết hạn trong cửa sổ này."
          rows={s.nearExpiryLots.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 gap-2">
              <div className="min-w-0">
                <span className="font-medium">{b.productName}</span>
                <span className="text-muted-foreground"> — {b.variantName}</span>
                {b.lotCode ? <span className="text-[10px] block text-muted-foreground font-mono">{b.lotCode}</span> : null}
              </div>
              <StatusBadge status="near-expiry" label={formatDate(b.expiryDate)} />
            </div>
          ))}
        />
        <AlertListCard
          icon={AlertTriangle}
          iconClass="text-destructive"
          title={`Hết HSD (${s.expiredCount})`}
          subtitle="Hạn sử dụng trước hôm nay."
          empty="Không có lô quá hạn ghi nhận trên projection."
          rows={s.expiredLots.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0 gap-2">
              <div className="min-w-0">
                <span className="font-medium">{b.productName}</span>
                <span className="text-muted-foreground"> — {b.variantName}</span>
              </div>
              <StatusBadge status="near-expiry" label={formatDate(b.expiryDate)} />
            </div>
          ))}
        />
      </div>
    </div>
  );
}

function statusMini(status: string) {
  if (status === "confirmed") return <StatusBadge status="confirmed" />;
  if (status === "cancelled") return <StatusBadge status="cancelled" />;
  if (status === "paid_auto") return <StatusBadge status="pending" label="CK" />;
  return <StatusBadge status="pending" />;
}

function AlertListCard(props: {
  icon: typeof Package;
  iconClass: string;
  title: string;
  subtitle?: string;
  empty: string;
  rows: ReactNode;
}) {
  const { icon: Icon, iconClass, title, subtitle, empty, rows } = props;
  const isEmpty =
    rows == null ||
    rows === false ||
    (Array.isArray(rows) && rows.length === 0);
  return (
    <div className="bg-card rounded-lg border p-4 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        <h3 className="font-semibold text-sm leading-tight">{title}</h3>
      </div>
      {subtitle ? <p className="text-[10px] text-muted-foreground mb-2">{subtitle}</p> : null}
      <div className="space-y-1.5 min-h-[120px]">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground py-2">{empty}</p>
        ) : (
          rows
        )}
      </div>
    </div>
  );
}
