import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { OrderTimeline } from "@/components/shared/OrderTimeline";
import { AsyncBoundary } from "@/components/shared/AsyncBoundary";
import { EmptyState } from "@/components/shared/EmptyState";
import { useService } from "@/hooks/useService";
import { pendingOrders as pendingOrdersService } from "@/services";
import type { PendingOrder, PendingOrderStatus, PaymentMethod } from "@/services/types";
import { formatVND, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  bankPaymentLinkBanner,
  canConfirmPendingOrder,
  isPendingLikeStatus,
} from "@/lib/pendingOrderConfirm";
import {
  Clock, Eye, Check, X, AlertTriangle, CreditCard, User, Calendar,
  MapPin, Gift, Tag, Truck, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { dispatchAdminBadgesRefresh } from "@/lib/adminBadges";
import { TablePagination } from "@/components/shared/TablePagination";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/lib/admin-auth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SortableTh } from "@/components/shared/SortableTh";
import type { SortDirection } from "@/services/types";

type TabId = "all" | PendingOrderStatus;

function statusBadge(status: PendingOrderStatus) {
  switch (status) {
    case "pending_payment":
    case "waiting_confirm":
      return <StatusBadge status="pending" />;
    case "paid_auto":
      return <StatusBadge status="pending" label="Đã nhận CK" />;
    case "confirmed":
      return <StatusBadge status="confirmed" />;
    case "cancelled":
      return <StatusBadge status="cancelled" />;
    default:
      return null;
  }
}

function paymentBadge(method: PaymentMethod) {
  switch (method) {
    case "cash": return <StatusBadge status="cash" />;
    case "bank_transfer": return <StatusBadge status="transfer" />;
    case "momo": return <StatusBadge status="momo" />;
    case "zalopay": return <StatusBadge status="zalopay" />;
    default: return null;
  }
}

function paymentLinkHint(order: PendingOrder): string | null {
  return bankPaymentLinkBanner(order);
}

function timeRemaining(expiresAt?: string) {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Đã hết hạn";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)} ngày`;
  return `${hours}h ${minutes}p`;
}

export default function AdminPendingOrders() {
  const { isAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<PendingOrder | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ field: string; direction: SortDirection }>({
    field: "createdAt",
    direction: "desc",
  });

  const { data, loading, error, isEmpty, reload } = useService(
    () =>
      pendingOrdersService.list({
        page,
        pageSize,
        query: debouncedSearch || undefined,
        status: activeTab === "all" ? undefined : activeTab,
        sort: [sort],
      }),
    [activeTab, debouncedSearch, page, pageSize, sort],
  );

  const { data: counts } = useService(
    () => pendingOrdersService.counts({ search: debouncedSearch || undefined }),
    [debouncedSearch],
  );
  const toggleSort = (field: string) => {
    setPage(1);
    setSort((prev) => {
      if (prev.field !== field) return { field, direction: "asc" };
      return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  };


  const orderList: PendingOrder[] = useMemo(() => data?.items ?? [], [data]);

  // Backend-owned refresh for pending-order reconciliation state.
  const lastSeenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [reload]);

  // Toast on newly arrived pending orders.
  useEffect(() => {
    if (loading) return;
    const seen = lastSeenIdsRef.current;
    // `paid_auto` is payment-proven but still waiting for authoritative confirm.
    const incoming = orderList.filter(
      (o) =>
        (o.status === "pending_payment" || o.status === "waiting_confirm" || o.status === "paid_auto") &&
        !seen.has(o.id),
    );
    if (seen.size > 0 && incoming.length > 0) {
      toast.info(`Hóa đơn chờ xử lý: ${incoming.length} đơn mới`);
    }
    orderList.forEach((o) => seen.add(o.id));
  }, [orderList, loading]);

  const tabs = useMemo(() => ([
    { id: "all" as TabId, label: "Tất cả", count: counts?.all ?? 0 },
    { id: "pending_payment" as TabId, label: "Chờ thanh toán", count: counts?.pending_payment ?? 0 },
    { id: "waiting_confirm" as TabId, label: "Chờ xác nhận", count: counts?.waiting_confirm ?? 0 },
    { id: "paid_auto" as TabId, label: "Đã nhận CK", count: counts?.paid_auto ?? 0 },
    { id: "confirmed" as TabId, label: "Đã xác nhận", count: counts?.confirmed ?? 0 },
    { id: "cancelled" as TabId, label: "Đã hủy", count: counts?.cancelled ?? 0 },
  ]), [counts]);

  const pendingCount = (counts?.pending_payment ?? 0) + (counts?.waiting_confirm ?? 0) + (counts?.paid_auto ?? 0);

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const o = orderList.find(x => x.id === confirmTarget);
    if (!o) { setConfirmTarget(null); return; }
    try {
      const updated = await pendingOrdersService.confirm(confirmTarget);
      if (detailOrder?.id === confirmTarget) setDetailOrder(updated);
      reload();
      const invNo = updated.confirmedInvoiceNo!;
      toast.success(`Đã xác nhận ${o.code}. Hóa đơn ${invNo} đã được tạo trên máy chủ.`, {
        duration: 12_000,
        action: {
          label: "Hóa đơn",
          onClick: () => navigate(`/admin/invoices?q=${encodeURIComponent(invNo)}`),
        },
      });
      dispatchAdminBadgesRefresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Không thể tạo hóa đơn");
    }
    setConfirmTarget(null);
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const o = orderList.find(x => x.id === cancelTarget);
    const updated = await pendingOrdersService.cancel(cancelTarget);
    if (detailOrder?.id === cancelTarget) setDetailOrder(updated);
    reload();
    toast.success(`Đã hủy đơn ${o?.code ?? ""}`);
    setCancelTarget(null);
    dispatchAdminBadgesRefresh();
  };

  const isPendingLike = (s: PendingOrderStatus) => isPendingLikeStatus(s);

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader title="Đơn chờ thanh toán" description={`${pendingCount} đơn đang chờ xử lý`} />

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-warning-soft rounded-lg border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning">
            Có {pendingCount} đơn hàng đang chờ xử lý thanh toán hoặc xác nhận đơn
          </p>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setPage(1);
              setActiveTab(tab.id);
            }}
            className={cn(
              "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={searchInput}
          onChange={(e) => {
            setPage(1);
            setSearchInput(e.target.value);
          }}
          placeholder="Tìm theo mã đơn, tên/SĐT khách, mã tham chiếu..."
          className="max-w-md"
        />
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={isEmpty || orderList.length === 0}
        data={orderList}
        onRetry={reload}
        emptyFallback={
          <EmptyState icon={Receipt} title="Không có đơn nào" description="Chưa có đơn chờ thanh toán nào trong nhóm này." />
        }
      >
        {(rows) => (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <SortableTh
                      label="Mã đơn"
                      sortKey="orderNo"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Khách hàng"
                      sortKey="customerName"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Thanh toán"
                      sortKey="paymentMethod"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                      align="center"
                    />
                    <SortableTh
                      label="Tổng"
                      sortKey="totalAmount"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortableTh
                      label="Thời gian"
                      sortKey="createdAt"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                      align="center"
                    />
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Còn lại</th>
                    <SortableTh
                      label="Trạng thái"
                      sortKey="status"
                      sort={{ key: sort.field, dir: sort.direction }}
                      onSort={toggleSort}
                      align="center"
                    />
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(order => (
                    <tr key={order.id} className={cn(
                      "border-b last:border-0 hover:bg-muted/30 transition-colors",
                      isPendingLike(order.status) && "bg-warning-soft/30"
                    )}>
                      <td className="px-3 py-2.5 font-mono text-xs font-medium">
                        <button onClick={() => setDetailOrder(order)} className="hover:text-primary hover:underline">{order.code}</button>
                      </td>
                      <td className="px-3 py-2.5">{order.customerName ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center">{paymentBadge(order.paymentMethod)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatVND(order.pricingBreakdownSnapshot.total)}</td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{formatDateTime(order.createdAt)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {isPendingLike(order.status) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-[11px] font-medium">
                            <Clock className="h-3 w-3" />
                            {timeRemaining(order.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {statusBadge(order.status)}
                          {paymentLinkHint(order) && (
                            <span
                              className="text-[10px] text-warning font-medium max-w-[160px] leading-tight"
                              data-testid={`pending-payment-link-${order.id}`}
                            >
                              {paymentLinkHint(order)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && isPendingLike(order.status) && (() => {
                            const decision = canConfirmPendingOrder(order);
                            return (
                              <>
                                <button
                                  data-testid={`pending-confirm-${order.id}`}
                                  onClick={() => decision.canConfirm && setConfirmTarget(order.id)}
                                  disabled={!decision.canConfirm}
                                  title={decision.reason ?? "Xác nhận đơn"}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded",
                                    decision.canConfirm
                                      ? "bg-success text-success-foreground hover:opacity-90"
                                      : "bg-muted text-muted-foreground cursor-not-allowed",
                                  )}
                                >
                                  <Check className="h-3 w-3" /> Xác nhận
                                </button>
                                <button data-testid={`pending-cancel-${order.id}`} onClick={() => setCancelTarget(order.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-danger text-danger-foreground rounded hover:opacity-90">
                                  <X className="h-3 w-3" /> Hủy
                                </button>
                              </>
                            );
                          })()}
                          <button onClick={() => setDetailOrder(order)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="Xem chi tiết">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {rows.map(order => (
                <div key={order.id} className={cn(
                  "bg-card rounded-lg border p-3",
                  isPendingLike(order.status) && "border-warning/30 bg-warning-soft/30"
                )}>
                  <button onClick={() => setDetailOrder(order)} className="w-full text-left">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono text-xs font-medium">{order.code}</p>
                        <p className="text-xs text-muted-foreground">{order.customerName ?? "—"}</p>
                        {paymentLinkHint(order) && (
                          <p className="text-[10px] text-warning font-medium mt-1" data-testid={`pending-payment-link-m-${order.id}`}>
                            {paymentLinkHint(order)}
                          </p>
                        )}
                      </div>
                      {statusBadge(order.status)}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {paymentBadge(order.paymentMethod)}
                        {isPendingLike(order.status) && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-warning"><Clock className="h-3 w-3" />{timeRemaining(order.expiresAt)}</span>
                        )}
                      </div>
                      <span className="font-bold">{formatVND(order.pricingBreakdownSnapshot.total)}</span>
                    </div>
                  </button>
                  {isAdmin && isPendingLike(order.status) && (() => {
                    const decision = canConfirmPendingOrder(order);
                    return (
                      <div className="flex gap-2 mt-2 pt-2 border-t">
                        <button
                          onClick={() => decision.canConfirm && setConfirmTarget(order.id)}
                          disabled={!decision.canConfirm}
                          title={decision.reason ?? "Xác nhận đơn"}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded",
                            decision.canConfirm
                              ? "bg-success text-success-foreground"
                              : "bg-muted text-muted-foreground cursor-not-allowed",
                          )}
                        >
                          <Check className="h-3 w-3" /> Xác nhận
                        </button>
                        <button onClick={() => setCancelTarget(order.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-danger text-danger-foreground rounded">
                          <X className="h-3 w-3" /> Hủy
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
            <TablePagination
              page={page}
              totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))}
              total={data?.total ?? 0}
              rangeStart={(data?.total ?? 0) === 0 ? 0 : (page - 1) * pageSize + 1}
              rangeEnd={Math.min(page * pageSize, data?.total ?? 0)}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPage(1);
                setPageSize(value);
              }}
            />
          </>
        )}
      </AsyncBoundary>

      {isAdmin && <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title="Xác nhận thanh toán?"
        description="Sau khi xác nhận, hệ thống sẽ tạo hóa đơn chính thức và trừ tồn kho. Thao tác này không thể hoàn tác."
        confirmLabel="Xác nhận thanh toán"
      />}
      {isAdmin && <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Hủy đơn hàng?"
        description="Đơn hàng sẽ bị hủy. Khách hàng sẽ nhận được thông báo. Thao tác này không thể hoàn tác."
        confirmLabel="Hủy đơn"
        variant="danger"
      />}

      {/* Hide the side drawer while a confirm/cancel ConfirmDialog is open so we
          don't stack two backdrop blurs (was rendering blurry text — issue #7). */}
      {detailOrder && (!isAdmin || (!confirmTarget && !cancelTarget)) && (
        <PendingOrderDetail
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onConfirm={() => setConfirmTarget(detailOrder.id)}
          onCancel={() => setCancelTarget(detailOrder.id)}
          canManage={isAdmin}
        />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function PendingOrderDetail({ order, onClose, onConfirm, onCancel, canManage }: {
  order: PendingOrder;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  canManage: boolean;
}) {
  const isPendingLike = isPendingLikeStatus(order.status);
  const confirmDecision = canConfirmPendingOrder(order);
  const pb = order.pricingBreakdownSnapshot ?? {
    subtotal: 0, manualDiscount: 0, promotionDiscount: 0, voucherDiscount: 0,
    shippingFee: 0, shippingDiscount: 0, vatBase: 0, vatPercent: 0, vatAmount: 0, vat: 0, total: 0,
  };
  const addr = order.shippingAddress;
  const promo = order.promotionSnapshot;
  const voucher = order.voucherSnapshot;
  const gifts = order.giftLinesSnapshot ?? [];
  const ship = order.shippingQuoteSnapshot;
  const lines = order.lines ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-sm font-semibold">{order.code}</p>
            <div className="mt-1 flex items-center gap-2">
              {statusBadge(order.status)}
              {paymentBadge(order.paymentMethod)}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" /> {order.customerName ?? "—"} {order.customerPhone ? `· ${order.customerPhone}` : ""}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {formatDateTime(order.createdAt)}</div>
            {order.expiresAt && (
              <div className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> Hết hạn: {formatDateTime(order.expiresAt)}</div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground text-xs">Tham chiếu CK: <span className="font-mono">{order.paymentReference}</span></div>
          </div>

          {/* Shipping address */}
          {addr && (
            <Section title="Địa chỉ giao hàng" icon={MapPin}>
              <div className="border rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">{addr.receiverName} · {addr.phone}</p>
                <p className="text-muted-foreground">{addr.street}</p>
                <p className="text-muted-foreground">{addr.wardName}, {addr.districtName}, {addr.provinceName}</p>
                {addr.note && <p className="text-xs text-muted-foreground italic">Ghi chú: {addr.note}</p>}
              </div>
            </Section>
          )}

          {/* Timeline */}
          <Section title="Tiến trình" icon={Clock}>
            <div className="border rounded-lg p-3">
              <OrderTimeline
                paymentMethod={order.paymentMethod}
                status={order.status}
                createdAt={order.createdAt}
                expiresAt={order.expiresAt}
              />
            </div>
          </Section>

          {paymentLinkHint(order) && (
            <div
              className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-xs text-warning-foreground space-y-1"
              data-testid="pending-detail-payment-link-banner"
            >
              <p className="font-semibold">{paymentLinkHint(order)}</p>
              {order.linkedPaymentEventId != null && order.linkedPaymentEventId !== "" && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  Giao dịch #{order.linkedPaymentEventId}
                  {order.linkedPaymentAmount != null ? ` · ${formatVND(order.linkedPaymentAmount)}` : ""}
                </p>
              )}
            </div>
          )}

          {/* Lines */}
          <Section title={`Sản phẩm (${lines.length})`} icon={Receipt}>
            <div className="border rounded-lg divide-y">
              {lines.map((it) => (
                <div key={it.id} className="p-3 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {it.productName}{it.variantName ? ` · ${it.variantName}` : ""}
                      {it.rewardLine ? (
                        <span className="ml-1 text-[10px] font-normal text-primary">(Quà / giá gốc {formatVND(it.originalUnitPrice ?? it.unitPrice)})</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {it.qty} × {formatVND(it.unitPrice)}
                      {it.batchId != null && it.batchId !== "" ? (
                        <span className="ml-1 font-mono">· lô #{it.batchId}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="font-medium shrink-0">{formatVND(it.lineSubtotal)}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Promotion snapshot */}
          {promo && (
            <Section title="Khuyến mãi áp dụng" icon={Tag}>
              <div className="border rounded-lg p-3 text-sm space-y-1.5 bg-info-soft/30">
                <p className="font-medium">{promo.name}</p>
                <p className="text-xs text-muted-foreground">{promo.ruleSummary}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Giảm trên đơn</span>
                  <span className="font-medium">−{formatVND(promo.discountAmount)}</span>
                </div>
                {promo.shippingDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Giảm phí ship</span>
                    <span className="font-medium">−{formatVND(promo.shippingDiscountAmount)}</span>
                  </div>
                )}
                {promo.affectedLines && promo.affectedLines.length > 0 && (
                  <div className="pt-1.5 mt-1.5 border-t border-info/20 space-y-1">
                    {promo.affectedLines.map((l, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        • {l.productName}{l.variantName ? ` · ${l.variantName}` : ""}
                        {l.discountedAmount ? ` — giảm ${formatVND(l.discountedAmount)}` : ""}
                        {l.rewardQty ? ` — tặng ${l.rewardQty}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Voucher snapshot */}
          {voucher && (
            <Section title="Voucher" icon={Tag}>
              <div className="border rounded-lg p-3 text-sm space-y-1 bg-accent-soft/30">
                <div className="flex justify-between">
                  <span className="font-mono font-medium">{voucher.code}</span>
                  {!voucher.freeShipping && voucher.discountAmount > 0 ? (
                    <span className="font-medium">−{formatVND(voucher.discountAmount)}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Freeship / giảm phí ship</span>
                  )}
                </div>
                {(voucher.shippingDiscountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Giảm phí ship (voucher)</span>
                    <span className="font-medium">−{formatVND(voucher.shippingDiscountAmount ?? 0)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{voucher.ruleSummary}</p>
              </div>
            </Section>
          )}

          {/* Gift lines */}
          {gifts.length > 0 && (
            <Section title={`Quà tặng (${gifts.length})`} icon={Gift}>
              <div className="border rounded-lg divide-y">
                {gifts.map((g, i) => (
                  <div key={i} className="p-3 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{g.productName}{g.variantName ? ` · ${g.variantName}` : ""}</p>
                      <p className="text-xs text-muted-foreground">Từ KM: {g.promotionName}</p>
                    </div>
                    <span className="text-xs font-medium shrink-0">×{g.qty}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Shipping quote snapshot */}
          {ship && (
            <Section title="Vận chuyển" icon={Truck}>
              <div className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phí vận chuyển</span>
                  <span className="font-medium">{formatVND(ship.fee)}</span>
                </div>
                {ship.zoneCode && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Vùng</span>
                    <span className="font-mono">{ship.zoneCode}</span>
                  </div>
                )}
                {ship.etaDays && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Dự kiến giao</span>
                    <span>{ship.etaDays.min}–{ship.etaDays.max} ngày</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Nguồn báo giá</span>
                  <span>{ship.source === "carrier_api" ? "API hãng vận chuyển" : "Bảng vùng nội bộ"}</span>
                </div>
              </div>
            </Section>
          )}

          {/* Pricing breakdown */}
          <Section title="Chi tiết giá" icon={Receipt}>
            <div className="border rounded-lg p-3 text-sm space-y-1">
              <Row label="Tạm tính" value={formatVND(pb.subtotal)} />
              {pb.manualDiscount > 0 && <Row label="Giảm thủ công" value={`−${formatVND(pb.manualDiscount)}`} muted />}
              {pb.promotionDiscount > 0 && <Row label="Giảm khuyến mãi" value={`−${formatVND(pb.promotionDiscount)}`} muted />}
              {pb.voucherDiscount > 0 && <Row label="Giảm voucher" value={`−${formatVND(pb.voucherDiscount)}`} muted />}
              {(pb.loyaltyDiscount ?? 0) > 0 && <Row label={`Đổi điểm (${pb.loyaltyRedeemedPoints ?? 0} điểm)`} value={`−${formatVND(pb.loyaltyDiscount ?? 0)}`} muted dataTestId="pending-loyalty-discount" />}
              {(pb.loyaltyDiscount ?? 0) > 0 && <Row label="Điểm đã dùng" value={`${pb.loyaltyRedeemedPoints ?? 0}`} muted dataTestId="loyalty-redeemed-points" />}
              <Row label="Phí vận chuyển" value={formatVND(pb.shippingFee)} />
              {pb.shippingDiscount > 0 && <Row label="Giảm phí ship" value={`−${formatVND(pb.shippingDiscount)}`} muted />}
              {pb.vatPercent > 0 && (
                <>
                  <Row label={`VAT (${pb.vatPercent}%)`} value={formatVND(pb.vatAmount)} />
                  <Row label="Cơ sở thuế (VAT)" value={formatVND(pb.vatBase)} muted />
                </>
              )}
              <div className="pt-2 mt-1 border-t flex items-center justify-between">
                <span className="font-semibold">Tổng cộng</span>
                <span className="font-bold text-base text-primary">{formatVND(pb.total)}</span>
              </div>
            </div>
          </Section>

          {order.note && (
            <Section title="Ghi chú" icon={Receipt}>
              <p className="text-sm text-muted-foreground border rounded-lg p-3">{order.note}</p>
            </Section>
          )}
        </div>

        {canManage && isPendingLike ? (
          <div className="p-4 border-t flex gap-2">
            <button onClick={onCancel} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-danger text-danger-foreground rounded-md hover:opacity-90">
              <X className="h-4 w-4" /> Hủy đơn
            </button>
            <button
              onClick={() => confirmDecision.canConfirm && onConfirm()}
              disabled={!confirmDecision.canConfirm}
              title={confirmDecision.reason ?? "Xác nhận đơn"}
              data-testid="pending-detail-confirm-btn"
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md",
                confirmDecision.canConfirm
                  ? "bg-success text-success-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <Check className="h-4 w-4" /> Xác nhận
            </button>
          </div>
        ) : (
          <div className="p-4 border-t">
            <button onClick={onClose} className="w-full px-3 py-2 text-sm border rounded-md hover:bg-muted">Đóng</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted, dataTestId }: { label: string; value: string; muted?: boolean; dataTestId?: string }) {
  return (
    <div className="flex justify-between" data-testid={dataTestId}>
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
