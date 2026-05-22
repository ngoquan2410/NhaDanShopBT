import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { adminFetchJson } from "@/services/auth/adminApi";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatVND } from "@/lib/format";
import { CheckCircle2, XCircle, RefreshCw, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { TablePagination } from "@/components/shared/TablePagination";

/** Backend GhnQuoteLog JSON (camelCase). */
interface LogRow {
  id: number;
  createdAt: string;
  provinceName: string | null;
  districtName: string | null;
  wardName: string | null;
  weightGrams: number | null;
  subtotal: number | null;
  ok: boolean;
  fee: number | null;
  etaMin: number | null;
  etaMax: number | null;
  serviceId: number | null;
  reason: string | null;
  message: string | null;
  latencyMs: number | null;
  orderCode: string | null;
}

const PAGE_SIZE = 50;

type StatusFilter = "all" | "ok" | "fail";
type ReasonFilter = "all" | "timeout" | "no_config" | "address_unmapped" | "ghn_error" | "no_service" | "incomplete" | "unavailable" | "quote_failed";

const REASON_OPTIONS: { value: ReasonFilter; label: string }[] = [
  { value: "all", label: "Tất cả lý do" },
  { value: "timeout", label: "Timeout" },
  { value: "no_config", label: "Chưa cấu hình" },
  { value: "address_unmapped", label: "Địa chỉ không khớp" },
  { value: "ghn_error", label: "Lỗi GHN" },
  { value: "no_service", label: "Không có dịch vụ" },
  { value: "incomplete", label: "Thiếu địa chỉ" },
  { value: "unavailable", label: "Không báo giá được" },
  { value: "quote_failed", label: "quote_failed" },
];

interface SavedView {
  id: string;
  label: string;
  status: StatusFilter;
  reason: ReasonFilter;
}

const SAVED_VIEWS: SavedView[] = [
  { id: "all", label: "Tất cả", status: "all", reason: "all" },
  { id: "fails", label: "Chỉ lỗi", status: "fail", reason: "all" },
  { id: "timeouts", label: "Timeout", status: "fail", reason: "timeout" },
  { id: "unmapped", label: "Địa chỉ không khớp", status: "fail", reason: "address_unmapped" },
  { id: "no_config", label: "Chưa cấu hình", status: "fail", reason: "no_config" },
];

export default function GhnQuoteLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URLSearchParams();
      u.set("page", String(Math.max(0, page - 1)));
      u.set("size", String(PAGE_SIZE));
      u.set("sort", "createdAt,desc");
      if (debouncedSearch.trim()) u.set("search", debouncedSearch.trim());
      if (statusFilter === "ok") u.set("ok", "true");
      else if (statusFilter === "fail") u.set("ok", "false");
      if (reasonFilter !== "all") u.set("reason", reasonFilter);
      const data = await adminFetchJson<{ content?: LogRow[]; totalElements?: number }>(
          `/api/admin/ghn-quote-logs?${u.toString()}`,
      );
      const content = Array.isArray(data.content) ? data.content : [];
      setRows(content);
      setTotalElements(typeof data.totalElements === "number" ? data.totalElements : content.length);
    } catch {
      setRows([]);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, reasonFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, reasonFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.ok).length;
    const avgLatency = total
        ? Math.round(rows.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / total)
        : 0;
    return { total, ok, fail: total - ok, avgLatency };
  }, [rows]);

  const activeView = SAVED_VIEWS.find((v) => v.status === statusFilter && v.reason === reasonFilter)?.id ?? null;

  const applyView = (v: SavedView) => {
    setStatusFilter(v.status);
    setReasonFilter(v.reason);
  };

  return (
      <div className="space-y-4">
        <PageHeader
            title="Nhật ký báo giá GHN"
            description="Ghi lại từ API backend (ShippingQuote) — không dùng Supabase"
            actions={
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Làm mới
              </Button>
            }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={`Tổng (lọc BE)`} value={String(totalElements)} />
          <StatCard label="OK (trang)" value={String(stats.ok)} tone="success" />
          <StatCard label="FAIL (trang)" value={String(stats.fail)} tone={stats.fail > 0 ? "danger" : "muted"} />
          <StatCard label="Độ trễ TB (trang)" value={`${stats.avgLatency} ms`} />
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {SAVED_VIEWS.map((v) => (
                  <button
                      key={v.id}
                      onClick={() => applyView(v)}
                      className={`px-3 h-7 rounded-full border text-xs font-semibold transition-colors ${
                          activeView === v.id
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background border-border hover:border-foreground/40"
                      }`}
                  >
                    {v.label}
                  </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Tìm theo địa chỉ, mã đơn, lý do…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="ok">Thành công</SelectItem>
                  <SelectItem value="fail">Thất bại</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as ReasonFilter)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop / tablet: full table */}
            <div className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Địa chỉ</TableHead>
                    <TableHead className="text-right">Cân (g)</TableHead>
                    <TableHead className="text-right">Phí</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                    <TableHead>Lý do / Mã đơn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Đang tải…
                        </TableCell>
                      </TableRow>
                  ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Chưa có log nào khớp bộ lọc.
                        </TableCell>
                      </TableRow>
                  ) : (
                      rows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs whitespace-nowrap">
                              {format(new Date(r.createdAt), "dd/MM HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              {r.ok ? (
                                  <Badge variant="outline" className="border-success text-success gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    OK
                                  </Badge>
                              ) : (
                                  <Badge variant="outline" className="border-danger text-danger gap-1">
                                    <XCircle className="h-3 w-3" />
                                    FAIL
                                  </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs max-w-[260px] truncate">
                              {[r.wardName, r.districtName, r.provinceName].filter(Boolean).join(", ") || "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">{r.weightGrams ?? "—"}</TableCell>
                            <TableCell className="text-right text-xs font-semibold">
                              {r.fee != null ? formatVND(r.fee) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {r.latencyMs != null ? `${r.latencyMs}ms` : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.orderCode ? (
                                  <Link
                                      to={`/admin/pending-orders?code=${encodeURIComponent(r.orderCode)}`}
                                      className="text-primary hover:underline font-mono"
                                  >
                                    {r.orderCode}
                                  </Link>
                              ) : r.reason ? (
                                  <div className="space-y-0.5">
                                    <p className="font-mono text-danger">{r.reason}</p>
                                    {r.message && (
                                        <p className="text-muted-foreground text-[11px] truncate max-w-[260px]">
                                          {r.message}
                                        </p>
                                    )}
                                  </div>
                              ) : (
                                  <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: stacked cards (table cells become unreadable at <768px) */}
            <div className="md:hidden space-y-2">
              {loading ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Đang tải…</p>
              ) : rows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Chưa có log nào khớp bộ lọc.</p>
              ) : (
                  rows.map((r) => (
                      <Card key={r.id}>
                        <CardContent className="p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {format(new Date(r.createdAt), "dd/MM HH:mm:ss")}
                      </span>
                            {r.ok ? (
                                <Badge variant="outline" className="border-success text-success gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> OK
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="border-danger text-danger gap-1">
                                  <XCircle className="h-3 w-3" /> FAIL
                                </Badge>
                            )}
                          </div>
                          <p className="truncate">
                            {[r.wardName, r.districtName, r.provinceName].filter(Boolean).join(", ") || "—"}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <p className="text-muted-foreground">Cân</p>
                              <p className="font-medium">{r.weightGrams ?? "—"}g</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Phí</p>
                              <p className="font-semibold">{r.fee != null ? formatVND(r.fee) : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Latency</p>
                              <p>{r.latencyMs != null ? `${r.latencyMs}ms` : "—"}</p>
                            </div>
                          </div>
                          {r.orderCode ? (
                              <Link
                                  to={`/admin/pending-orders?code=${encodeURIComponent(r.orderCode)}`}
                                  className="text-primary hover:underline font-mono text-[11px]"
                              >
                                {r.orderCode}
                              </Link>
                          ) : r.reason ? (
                              <div>
                                <p className="font-mono text-danger text-[11px]">{r.reason}</p>
                                {r.message && (
                                    <p className="text-muted-foreground text-[11px] mt-0.5">{r.message}</p>
                                )}
                              </div>
                          ) : null}
                        </CardContent>
                      </Card>
                  ))
              )}
            </div>
            <TablePagination
                page={page}
                totalPages={Math.max(1, Math.ceil(totalElements / PAGE_SIZE))}
                total={totalElements}
                rangeStart={totalElements === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
                rangeEnd={Math.min(totalElements, page * PAGE_SIZE)}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" | "muted" }) {
  const toneCls =
      tone === "success" ? "text-success"
          : tone === "danger" ? "text-danger"
              : tone === "muted" ? "text-muted-foreground"
                  : "text-foreground";
  return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold mt-1 ${toneCls}`}>{value}</p>
        </CardContent>
      </Card>
  );
}
