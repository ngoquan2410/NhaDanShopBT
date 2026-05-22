// Admin worklist for bank transactions received via the Casso webhook.
// - "Chưa khớp": rows with status='unmatched' (no order code extracted) → admin links manually
// - "Đã khớp tự động": rows the trigger linked (status='matched' or 'linked')
// - "Đã bỏ qua": rows admin marked as ignored → restorable
// Refresh uses short-interval polling plus visibility re-sync.
import { useEffect, useState, useCallback } from "react";
import { paymentEvents, pendingOrders } from "@/services";
import type { PaymentEvent } from "@/services";
import type { PendingOrder } from "@/services/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatVND, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  RefreshCw, Link2, X, Inbox, Search, RotateCcw, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { dispatchAdminBadgesRefresh } from "@/lib/adminBadges";
import { TablePagination } from "@/components/shared/TablePagination";

type TabId = "unmatched" | "matched" | "ignored";

const TABS: { id: TabId; label: string; icon: typeof Inbox }[] = [
  { id: "unmatched", label: "Chưa khớp", icon: AlertCircle },
  { id: "matched", label: "Đã khớp tự động", icon: CheckCircle2 },
  { id: "ignored", label: "Đã bỏ qua", icon: X },
];

export default function UnmatchedPaymentsPage() {
  const [tab, setTab] = useState<TabId>("unmatched");
  const [unmatched, setUnmatched] = useState<PaymentEvent[]>([]);
  const [matched, setMatched] = useState<PaymentEvent[]>([]);
  const [ignored, setIgnored] = useState<PaymentEvent[]>([]);
  const [unmatchedTotal, setUnmatchedTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<PaymentEvent | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [uPage, recent, ig] = await Promise.all([
        paymentEvents.listUnmatchedPaymentEventsPage({
          page,
          pageSize,
          search,
          sortField: "txTime",
          sortDir: "desc",
        }),
        paymentEvents.listRecent(100),
        paymentEvents.listIgnored(100),
      ]);
      setUnmatched(uPage.items);
      setUnmatchedTotal(uPage.total);
      // "matched" tab = anything already linked to an order, excluding ignored
      setMatched(
          recent.filter(
              (e) =>
                  (e.status === "matched" || e.status === "linked") &&
                  (e.linkedOrderCode || e.matchedCode),
          ),
      );
      setIgnored(ig);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được danh sách giao dịch");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  // Near-real-time polling keeps the worklist current without browser realtime channels.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const rows = tab === "unmatched" ? unmatched : tab === "matched" ? matched : ignored;
  const counts = {
    unmatched: unmatchedTotal,
    matched: matched.length,
    ignored: ignored.length,
  };

  return (
      <div className="space-y-4">
        <PageHeader
            title="Đối soát giao dịch ngân hàng"
            description="Các giao dịch nhận từ webhook Casso. Mã đơn được trích tự động từ nội dung CK; đơn nào không khớp bạn có thể gắn thủ công ở đây."
            actions={
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Làm mới
              </Button>
            }
        />

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b">
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = counts[t.id];
            return (
                <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      if (t.id === "unmatched") setPage(1);
                    }}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                        active
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {count > 0 && (
                      <span
                          className={cn(
                              "ml-1 text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                              active
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground",
                          )}
                      >
                  {count}
                </span>
                  )}
                </button>
            );
          })}
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          {tab === "unmatched" && (
              <div className="p-3 border-b">
                <Input
                    value={search}
                    onChange={(e) => {
                      setPage(1);
                      setSearch(e.target.value);
                    }}
                    placeholder="Tìm txId, nội dung CK, mã đơn, tài khoản..."
                />
              </div>
          )}
          {rows.length === 0 && !loading ? (
              <EmptyState
                  icon={Inbox}
                  title={
                    tab === "unmatched"
                        ? "Không có giao dịch chờ xử lý"
                        : tab === "matched"
                            ? "Chưa có giao dịch nào được khớp gần đây"
                            : "Không có giao dịch nào bị bỏ qua"
                  }
                  description={
                    tab === "unmatched"
                        ? "Mọi giao dịch đến từ webhook đã được khớp với đơn hoặc bị bỏ qua."
                        : tab === "matched"
                            ? "Giao dịch khớp tự động sẽ hiển thị tại đây."
                            : undefined
                  }
              />
          ) : (
              <>
                {/* Mobile cards */}
                <ul className="sm:hidden divide-y">
                  {rows.map((e) => {
                    const linkedCode = e.linkedOrderCode ?? e.matchedCode;
                    return (
                        <li key={`m-${e.id}`} className="px-3 py-2.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm">{formatVND(e.amount)}</div>
                              <div className="text-[11px] text-muted-foreground">{formatDateTime(e.txTime ?? e.createdAt)}</div>
                            </div>
                            {linkedCode && (
                                tab === "matched" ? (
                                    <Link to={`/admin/pending-orders`} className="rounded bg-success/10 text-success text-[11px] px-2 py-0.5 font-mono hover:underline shrink-0">{linkedCode}</Link>
                                ) : (
                                    <span className="rounded bg-primary/10 text-primary text-[11px] px-2 py-0.5 font-mono shrink-0">{linkedCode}</span>
                                )
                            )}
                          </div>
                          {e.transferContent && <p className="text-[11px] text-muted-foreground line-clamp-2">{e.transferContent}</p>}
                          <p className="text-[10px] text-muted-foreground">{e.bankSubAcc || e.bankAccount || "—"}</p>
                          <div className="flex items-center justify-end flex-wrap gap-1 pt-1">
                            {tab === "unmatched" && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => setLinking(e)} className="text-primary h-7 text-xs"><Link2 className="h-3.5 w-3.5 mr-1" /> Gắn vào đơn</Button>
                                  <Button variant="ghost" size="sm" onClick={async () => { try { await paymentEvents.markIgnored(e.id); toast.success("Đã bỏ qua giao dịch"); await refresh(); dispatchAdminBadgesRefresh(); } catch (err: any) { toast.error(err?.message ?? "Không bỏ qua được"); } }} className="text-muted-foreground h-7 text-xs"><X className="h-3.5 w-3.5 mr-1" /> Bỏ qua</Button>
                                </>
                            )}
                            {tab === "ignored" && (
                                <Button variant="ghost" size="sm" onClick={async () => { try { await paymentEvents.unmarkIgnored(e.id); toast.success("Đã khôi phục giao dịch"); await refresh(); dispatchAdminBadgesRefresh(); } catch (err: any) { toast.error(err?.message ?? "Không khôi phục được"); } }} className="text-primary h-7 text-xs"><RotateCcw className="h-3.5 w-3.5 mr-1" /> Khôi phục</Button>
                            )}
                            {tab === "matched" && <span className="inline-flex items-center gap-1 text-[11px] text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Đã khớp</span>}
                          </div>
                        </li>
                    );
                  })}
                </ul>
                {/* Desktop / tablet table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Thời gian</th>
                      <th className="text-right px-3 py-2 font-medium">Số tiền</th>
                      <th className="text-left px-3 py-2 font-medium">Nội dung</th>
                      <th className="text-left px-3 py-2 font-medium">
                        {tab === "matched" ? "Đơn đã khớp" : "Mã đơn (gợi ý)"}
                      </th>
                      <th className="text-left px-3 py-2 font-medium">Tài khoản</th>
                      <th className="text-right px-3 py-2 font-medium">Hành động</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((e) => {
                      const linkedCode = e.linkedOrderCode ?? e.matchedCode;
                      return (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-2 whitespace-nowrap text-xs">
                              {formatDateTime(e.txTime ?? e.createdAt)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {formatVND(e.amount)}
                            </td>
                            <td
                                className="px-3 py-2 max-w-[280px] truncate"
                                title={e.transferContent}
                            >
                              {e.transferContent || (
                                  <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {linkedCode ? (
                                  tab === "matched" ? (
                                      <Link
                                          to={`/admin/pending-orders`}
                                          className="inline-block rounded bg-success/10 text-success text-xs px-2 py-0.5 font-mono hover:underline"
                                      >
                                        {linkedCode}
                                      </Link>
                                  ) : (
                                      <span className="inline-block rounded bg-primary/10 text-primary text-xs px-2 py-0.5 font-mono">
                              {linkedCode}
                            </span>
                                  )
                              ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {e.bankSubAcc || e.bankAccount || "—"}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {tab === "unmatched" && (
                                  <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setLinking(e)}
                                        className="text-primary"
                                    >
                                      <Link2 className="h-3.5 w-3.5 mr-1" /> Gắn vào đơn
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            await paymentEvents.markIgnored(e.id);
                                            toast.success("Đã bỏ qua giao dịch");
                                            await refresh();
                                            dispatchAdminBadgesRefresh();
                                          } catch (err: any) {
                                            toast.error(err?.message ?? "Không bỏ qua được");
                                          }
                                        }}
                                        className="text-muted-foreground"
                                    >
                                      <X className="h-3.5 w-3.5 mr-1" /> Bỏ qua
                                    </Button>
                                  </>
                              )}
                              {tab === "ignored" && (
                                  <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          await paymentEvents.unmarkIgnored(e.id);
                                          toast.success("Đã khôi phục giao dịch");
                                          await refresh();
                                          dispatchAdminBadgesRefresh();
                                        } catch (err: any) {
                                          toast.error(err?.message ?? "Không khôi phục được");
                                        }
                                      }}
                                      className="text-primary"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Khôi phục
                                  </Button>
                              )}
                              {tab === "matched" && (
                                  <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đã khớp
                          </span>
                              )}
                            </td>
                          </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </>
          )}
        </div>
        {tab === "unmatched" && (
            <TablePagination
                page={page}
                totalPages={Math.max(1, Math.ceil(unmatchedTotal / pageSize))}
                total={unmatchedTotal}
                rangeStart={unmatchedTotal === 0 ? 0 : (page - 1) * pageSize + 1}
                rangeEnd={Math.min(page * pageSize, unmatchedTotal)}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(value) => {
                  setPage(1);
                  setPageSize(value);
                }}
            />
        )}

        <LinkDialog
            event={linking}
            onClose={() => setLinking(null)}
            onLinked={() => {
              setLinking(null);
              refresh();
              dispatchAdminBadgesRefresh();
            }}
        />
      </div>
  );
}

/** Search pending orders and link the chosen event to the selected order. */
function LinkDialog({
                      event,
                      onClose,
                      onLinked,
                    }: {
  event: PaymentEvent | null;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!event) return;
    setQuery(event.matchedCode ?? "");
  }, [event]);

  useEffect(() => {
    if (!event) return;
    let alive = true;
    (async () => {
      const res = await pendingOrders.listLinkable({
        query: query.trim() || undefined,
        pageSize: 20,
      });
      if (alive) setOrders(res.items);
    })();
    return () => {
      alive = false;
    };
  }, [event, query]);

  const handleLink = async (order: PendingOrder) => {
    if (!event) return;
    setBusyId(order.id);
    try {
      await paymentEvents.linkToOrder(event.id, order.code);
      const total = order.pricingBreakdownSnapshot.total;
      const ev = Number(event.amount);
      if (ev === total) {
        toast.success(`Đã ghi nhận thanh toán cho ${order.code} — chờ xác nhận đơn (chưa xuất hóa đơn).`);
      } else {
        toast.success(`Đã gắn giao dịch vào ${order.code}. Cần đối soát số tiền trước khi xác nhận đơn.`);
      }
      onLinked();
    } catch (err: any) {
      const message = String(err?.message ?? "");
      toast.error(
          message.includes("không còn đủ điều kiện")
              ? "Đơn không còn đủ điều kiện để gắn giao dịch."
              : message || "Không gắn được giao dịch",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
      <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gắn giao dịch vào đơn</DialogTitle>
          </DialogHeader>
          {event && (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Số tiền</span>
                    <strong>{formatVND(event.amount)}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">Nội dung</span>
                    <span className="text-right break-all">
                  {event.transferContent || "—"}
                </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Thời gian</span>
                    <span>{formatDateTime(event.txTime ?? event.createdAt)}</span>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Tìm theo mã đơn / tên / số điện thoại…"
                      className="pl-8"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                  {orders.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">
                        Không tìm thấy đơn phù hợp.
                      </div>
                  ) : (
                      orders.map((o) => {
                        const orderTotal = o.pricingBreakdownSnapshot.total;
                        const evAmt = Number(event.amount);
                        const deltaAbs = Math.abs(Math.round(evAmt - orderTotal));
                        const moneyLabel =
                            evAmt === orderTotal
                                ? { cls: "text-success", text: "Khớp đúng số tiền" }
                                : evAmt < orderTotal
                                    ? { cls: "text-warning", text: `Thiếu ${formatVND(deltaAbs)} — cần đối soát` }
                                    : { cls: "text-warning", text: `Dư ${formatVND(deltaAbs)} — cần đối soát` };
                        return (
                            <button
                                key={o.id}
                                type="button"
                                data-testid={`unmatched-link-candidate-${o.code}`}
                                data-amount-relation={evAmt === orderTotal ? "exact" : evAmt < orderTotal ? "under" : "over"}
                                onClick={() => handleLink(o)}
                                disabled={busyId === o.id}
                                className="w-full flex items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/50 transition disabled:opacity-50"
                            >
                              <div className="min-w-0">
                                <div className="font-mono font-medium">{o.code}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {o.customerName ?? "—"} · {o.customerPhone ?? "—"} ·{" "}
                                  {o.status}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold">
                                  {formatVND(orderTotal)}
                                </div>
                                <div className={`text-[11px] ${moneyLabel.cls}`}>
                                  {moneyLabel.text}
                                </div>
                              </div>
                            </button>
                        );
                      })
                  )}
                </div>
              </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
