import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Tag, Power, AlertCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormDrawer } from "@/components/shared/FormDrawer";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatVND } from "@/lib/format";
import { toast } from "sonner";
import type { AdminVoucherRow } from "@/services/admin/adminVouchersApi";
import {
  buildVoucherUpsertBody,
  createAdminVoucher,
  dateInputToEndAt,
  dateInputToStartAt,
  deleteAdminVoucher,
  fetchAdminVoucherPage,
  toLocalDateInput,
  toggleAdminVoucherActive,
  updateAdminVoucher,
} from "@/services/admin/adminVouchersApi";

type Draft = {
  code: string;
  ruleSummary: string;
  minSubtotal: number;
  percent: number;
  cap: number;
  fixedAmount: number;
  freeShipping: boolean;
  active: boolean;
  startAt: string;
  endAt: string;
};

type DraftErrors = Partial<Record<keyof Draft, string>>;

const emptyDraft: Draft = {
  code: "",
  ruleSummary: "",
  minSubtotal: 0,
  percent: 0,
  cap: 0,
  fixedAmount: 0,
  freeShipping: false,
  active: true,
  startAt: "",
  endAt: "",
};

function isCodeTakenBackend(code: string, rows: AdminVoucherRow[], editingId?: number): boolean {
  const c = code.trim().toUpperCase();
  return rows.some((r) => r.id !== editingId && r.code.toUpperCase() === c);
}

/**
 * Client rules aligned with Slice 6C + {@code VoucherRequest}.
 * freeShipping cannot combine with percent/fixed; percent and fixed cannot both be &gt; 0.
 */
function validateDraft(draft: Draft, rows: AdminVoucherRow[], editingId?: number): DraftErrors {
  const errors: DraftErrors = {};
  const code = draft.code.trim().toUpperCase();

  if (!code) {
    errors.code = "Vui lòng nhập mã voucher";
  } else if (!/^[A-Z0-9]{3,100}$/.test(code)) {
    errors.code = "Mã chỉ gồm chữ và số, dài 3–100 ký tự";
  } else if (isCodeTakenBackend(code, rows, editingId)) {
    errors.code = "Mã này đã tồn tại trên server";
  }

  if (draft.minSubtotal < 0) errors.minSubtotal = "Đơn tối thiểu phải ≥ 0";

  const hasPercent = draft.percent > 0;
  const hasFixed = draft.fixedAmount > 0;

  if (draft.freeShipping) {
    if (hasPercent) {
      errors.percent = "Miễn phí vận chuyển không kết hợp với giảm %";
    }
    if (hasFixed) {
      errors.fixedAmount = "Miễn phí vận chuyển không kết hợp với giảm tiền cố định";
    }
    if (draft.cap < 0) errors.cap = "Cap phải ≥ 0";
  } else {
    if (!hasPercent && !hasFixed) {
      errors.percent = "Cần nhập % giảm, số tiền giảm cố định, hoặc bật miễn phí vận chuyển";
    } else if (hasPercent && hasFixed) {
      errors.fixedAmount = "Không thể đặt đồng thời % và số tiền cố định";
    }

    if (hasPercent) {
      if (draft.percent > 100) errors.percent = "% giảm tối đa là 100";
      if (draft.cap < 0) errors.cap = "Cap phải ≥ 0";
      if (draft.minSubtotal > 0 && draft.cap > 0) {
        const maxAtThreshold = (draft.minSubtotal * draft.percent) / 100;
        if (draft.cap > maxAtThreshold + 1e-6) {
          errors.cap = `Cap không được vượt quá ${formatVND(Math.floor(maxAtThreshold))} (áp dụng tại ngưỡng đơn tối thiểu)`;
        }
      }
    } else if (hasFixed) {
      if (draft.cap > 0) errors.cap = "Cap chỉ áp dụng cho voucher % hoặc miễn phí ship (trần giảm phí)";
      if (draft.minSubtotal > 0 && draft.fixedAmount > draft.minSubtotal) {
        errors.fixedAmount = "Số tiền giảm không được lớn hơn đơn tối thiểu";
      }
    }
  }

  if (draft.startAt && draft.endAt) {
    const start = new Date(draft.startAt);
    const end = new Date(draft.endAt);
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      start > end
    ) {
      errors.endAt = "Ngày kết thúc phải sau ngày bắt đầu";
    }
  }

  return errors;
}

function formatRowDate(iso: string | null): string {
  if (!iso) return "…";
  return toLocalDateInput(iso) || iso;
}

export default function VouchersPage() {
  const [rows, setRows] = useState<AdminVoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminVoucherRow | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminVoucherRow | null>(null);
  const [mutating, setMutating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminVoucherPage(0, 200);
      setRows(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được danh sách voucher từ backend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const errors = useMemo(
    () => (touched ? validateDraft(draft, rows, editing?.id) : {}),
    [draft, touched, editing?.id, rows],
  );
  const hasErrors = Object.keys(errors).length > 0;

  const startCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setTouched(false);
    setOpen(true);
  };

  const startEdit = (v: AdminVoucherRow) => {
    setEditing(v);
    setDraft({
      code: v.code,
      ruleSummary: v.ruleSummary ?? "",
      minSubtotal: v.minSubtotal,
      percent: v.percent,
      cap: v.cap,
      fixedAmount: v.fixedAmount,
      freeShipping: v.freeShipping,
      active: v.active,
      startAt: toLocalDateInput(v.startAt),
      endAt: toLocalDateInput(v.endAt),
    });
    setTouched(false);
    setOpen(true);
  };

  const save = async () => {
    setTouched(true);
    const e = validateDraft(draft, rows, editing?.id);
    if (Object.keys(e).length > 0) {
      toast.error("Vui lòng kiểm tra lại các trường đang bị đánh dấu lỗi");
      return;
    }
    const body = buildVoucherUpsertBody({
      code: draft.code,
      ruleSummary: draft.ruleSummary.trim() || null,
      active: draft.active,
      minSubtotal: draft.minSubtotal,
      percent: draft.percent,
      cap: draft.cap,
      fixedAmount: draft.fixedAmount,
      freeShipping: draft.freeShipping,
      startAt: dateInputToStartAt(draft.startAt),
      endAt: dateInputToEndAt(draft.endAt),
    });

    setMutating(true);
    try {
      if (editing) {
        await updateAdminVoucher(editing.id, body);
        toast.success(`Đã cập nhật ${String(body.code).toUpperCase()} trên backend`);
      } else {
        await createAdminVoucher(body);
        toast.success(`Đã thêm ${String(body.code).toUpperCase()} trên backend`);
      }
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được lên backend");
    } finally {
      setMutating(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setMutating(true);
    try {
      await deleteAdminVoucher(confirmDelete.id);
      toast.success(`Đã xử lý xóa ${confirmDelete.code} (mã đã dùng trước đây có thể được lưu trữ thay vì xóa hẳn)`);
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xóa được trên backend");
    } finally {
      setMutating(false);
    }
  };

  const doToggle = async (v: AdminVoucherRow) => {
    setMutating(true);
    try {
      await toggleAdminVoucherActive(v.id);
      toast.success("Đã đổi trạng thái kích hoạt");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đổi được trạng thái");
    } finally {
      setMutating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Voucher / Mã giảm giá"
        description="Quản lý mã trên backend — đồng bộ với thanh toán / quote Slice 6C"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || mutating}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Thêm voucher
            </button>
          </div>
        }
      />

      {loadError ? (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border border-danger/40 bg-danger-soft">
          <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-danger">Không tải/lưu voucher từ backend</p>
            <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Đăng nhập phiên admin (JWT) là bắt buộc. Không dùng kho local làm nguồn sự thật cho POS thanh toán thật.
            </p>
          </div>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Đang tải voucher từ server…</p>
      ) : !loadError && rows.length === 0 ? (
        <EmptyState icon={Tag} title="Chưa có voucher nào" description="Thêm voucher trên backend để khách áp dụng khi thanh toán." />
      ) : rows.length > 0 ? (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Mã</th>
                <th className="text-left px-3 py-2 font-semibold">Mô tả</th>
                <th className="text-right px-3 py-2 font-semibold">Đơn tối thiểu</th>
                <th className="text-right px-3 py-2 font-semibold">Giảm / Ship</th>
                <th className="text-left px-3 py-2 font-semibold">Hiệu lực</th>
                <th className="text-center px-3 py-2 font-semibold">Trạng thái</th>
                <th className="text-right px-3 py-2 font-semibold w-1">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 font-mono font-semibold">{v.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">{v.ruleSummary || "—"}</td>
                  <td className="px-3 py-2 text-right">{v.minSubtotal > 0 ? formatVND(v.minSubtotal) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {v.freeShipping ? (
                      <>
                        Miễn phí GH
                        {v.cap > 0 ? ` (trần ${formatVND(v.cap)})` : ""}
                      </>
                    ) : v.percent > 0 ? (
                      `${v.percent}%${v.cap > 0 ? ` (tối đa ${formatVND(v.cap)})` : ""}`
                    ) : (
                      formatVND(v.fixedAmount)
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {v.startAt || v.endAt
                      ? `${formatRowDate(v.startAt)} → ${formatRowDate(v.endAt)}`
                      : "Không giới hạn"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={v.active ? "active" : "inactive"} label={v.active ? "Đang dùng" : "Tắt"} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void doToggle(v)}
                        disabled={mutating}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                        title={v.active ? "Tạm tắt" : "Kích hoạt"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(v)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(v)}
                        className="p-1.5 rounded hover:bg-danger-soft text-muted-foreground hover:text-danger"
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <FormDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Sửa voucher ${editing.code}` : "Thêm voucher mới"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-md border text-sm">
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={(touched && hasErrors) || mutating}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {mutating ? "Đang lưu…" : "Lưu lên backend"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label="Mã voucher *" error={errors.code}>
            <Input
              value={draft.code}
              onChange={(e) => {
                setDraft({ ...draft, code: e.target.value.toUpperCase() });
                setTouched(true);
              }}
              placeholder="VD: NHADAN10"
              maxLength={100}
              className="font-mono"
              aria-invalid={!!errors.code}
            />
          </FormField>

          <FormField label="Mô tả hiển thị (ruleSummary)">
            <Input
              value={draft.ruleSummary}
              onChange={(e) => setDraft({ ...draft, ruleSummary: e.target.value })}
              placeholder="VD: Giảm 10% đơn hàng (tối đa 50.000đ)"
            />
          </FormField>

          <FormField label="Đơn tối thiểu (VND)" error={errors.minSubtotal}>
            <Input
              type="number"
              min={0}
              value={draft.minSubtotal}
              onChange={(e) => {
                setDraft({ ...draft, minSubtotal: Math.max(0, Number(e.target.value) || 0) });
                setTouched(true);
              }}
              aria-invalid={!!errors.minSubtotal}
            />
          </FormField>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Miễn phí vận chuyển (freeShipping)</p>
              <p className="text-xs text-muted-foreground">Không kết hợp với % hoặc giảm tiền cố định. Cap có thể là trần giảm phí ship.</p>
            </div>
            <Switch
              checked={draft.freeShipping}
              onCheckedChange={(v) => {
                setTouched(true);
                setDraft({
                  ...draft,
                  freeShipping: v,
                  percent: v ? 0 : draft.percent,
                  fixedAmount: v ? 0 : draft.fixedAmount,
                });
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="% giảm" error={errors.percent}>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.percent}
                disabled={draft.freeShipping}
                onChange={(e) => {
                  const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                  setDraft({ ...draft, percent: pct, fixedAmount: pct > 0 ? 0 : draft.fixedAmount });
                  setTouched(true);
                }}
                aria-invalid={!!errors.percent}
              />
            </FormField>
            <FormField label="Cap (VND)" error={errors.cap} hint="% hoặc free ship: trần giảm.">
              <Input
                type="number"
                min={0}
                value={draft.cap}
                onChange={(e) => {
                  setDraft({ ...draft, cap: Math.max(0, Number(e.target.value) || 0) });
                  setTouched(true);
                }}
                disabled={!draft.freeShipping && draft.percent === 0}
                aria-invalid={!!errors.cap}
              />
            </FormField>
          </div>

          <FormField label="Hoặc giảm cố định (VND)" error={errors.fixedAmount} hint="Chỉ khi % = 0 và không bật miễn phí ship.">
            <Input
              type="number"
              min={0}
              value={draft.fixedAmount}
              disabled={draft.freeShipping || draft.percent > 0}
              onChange={(e) => {
                setDraft({ ...draft, fixedAmount: Math.max(0, Number(e.target.value) || 0) });
                setTouched(true);
              }}
              aria-invalid={!!errors.fixedAmount}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bắt đầu (startAt)" hint="Để trống = áp dụng ngay">
              <Input
                type="date"
                value={draft.startAt ?? ""}
                onChange={(e) => {
                  setDraft({ ...draft, startAt: e.target.value });
                  setTouched(true);
                }}
              />
            </FormField>
            <FormField label="Kết thúc (endAt)" error={errors.endAt} hint="Để trống = không giới hạn">
              <Input
                type="date"
                value={draft.endAt ?? ""}
                onChange={(e) => {
                  setDraft({ ...draft, endAt: e.target.value });
                  setTouched(true);
                }}
                aria-invalid={!!errors.endAt}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Kích hoạt (active)</p>
              <p className="text-xs text-muted-foreground">Tắt để tạm dừng nhưng giữ lại định nghĩa.</p>
            </div>
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
          </div>

          {touched && hasErrors && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-danger-soft border border-danger/30">
              <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">
                Vẫn còn {Object.keys(errors).length} trường chưa hợp lệ. Vui lòng kiểm tra lại.
              </p>
            </div>
          )}
        </div>
      </FormDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void doDelete()}
        title="Xóa voucher?"
        description={confirmDelete ? `Mã ${confirmDelete.code} sẽ được xử lý trên backend (xóa hoặc lưu trữ nếu đã dùng).` : ""}
        confirmLabel="Xóa"
        variant="danger"
      />
    </div>
  );
}

function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="text-[11px] text-danger mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
