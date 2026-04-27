import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Tag, Power, AlertCircle } from "lucide-react";
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
import {
  useVouchers,
  voucherActions,
  isCodeTaken,
  type VoucherDef,
} from "@/lib/vouchers-store";

const empty: Omit<VoucherDef, "id"> = {
  code: "",
  ruleSummary: "",
  minSubtotal: 0,
  percent: 0,
  cap: 0,
  fixedAmount: 0,
  active: true,
  startAt: "",
  endAt: "",
};

type Errors = Partial<Record<keyof Omit<VoucherDef, "id">, string>>;

/**
 * Validate a voucher draft. Returns a map of field → error message.
 * Empty map means the draft is saveable.
 *
 * Rules enforced:
 *  - Code: required, A-Z 0-9 only, 3–20 chars, unique (case-insensitive)
 *  - Min subtotal: ≥ 0
 *  - Either percent (1-100) OR fixedAmount > 0, never both
 *  - Percent voucher: cap ≥ 0; if cap > 0 it must be ≤ what the percent could
 *    ever produce on the min-subtotal threshold so the cap is meaningful
 *  - Date window: when both set, startAt ≤ endAt
 */
function validateVoucher(draft: Omit<VoucherDef, "id">, editingId?: string): Errors {
  const errors: Errors = {};
  const code = draft.code.trim().toUpperCase();

  if (!code) {
    errors.code = "Vui lòng nhập mã voucher";
  } else if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    errors.code = "Mã chỉ gồm chữ và số, dài 3–20 ký tự";
  } else if (isCodeTaken(code, editingId)) {
    errors.code = "Mã này đã tồn tại";
  }

  if (draft.minSubtotal < 0) errors.minSubtotal = "Đơn tối thiểu phải ≥ 0";

  const hasPercent = draft.percent > 0;
  const hasFixed = draft.fixedAmount > 0;

  if (!hasPercent && !hasFixed) {
    errors.percent = "Cần nhập % giảm hoặc số tiền giảm cố định";
  } else if (hasPercent && hasFixed) {
    errors.fixedAmount = "Không thể đặt đồng thời % và số tiền cố định";
  }

  if (hasPercent) {
    if (draft.percent > 100) errors.percent = "% giảm tối đa là 100";
    if (draft.cap < 0) errors.cap = "Cap phải ≥ 0";
  } else if (hasFixed) {
    if (draft.cap > 0) errors.cap = "Cap chỉ áp dụng cho voucher %";
    if (draft.minSubtotal > 0 && draft.fixedAmount > draft.minSubtotal) {
      errors.fixedAmount = "Số tiền giảm không được lớn hơn đơn tối thiểu";
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

export default function VouchersPage() {
  const vouchers = useVouchers();
  const [editing, setEditing] = useState<VoucherDef | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<VoucherDef, "id">>(empty);
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VoucherDef | null>(null);

  const errors = useMemo(
    () => (touched ? validateVoucher(draft, editing?.id) : {}),
    [draft, touched, editing?.id],
  );
  const hasErrors = Object.keys(errors).length > 0;

  const startCreate = () => {
    setEditing(null);
    setDraft(empty);
    setTouched(false);
    setOpen(true);
  };
  const startEdit = (v: VoucherDef) => {
    setEditing(v);
    const { id: _id, ...rest } = v;
    setDraft({ ...empty, ...rest });
    setTouched(false);
    setOpen(true);
  };

  const save = () => {
    setTouched(true);
    const e = validateVoucher(draft, editing?.id);
    if (Object.keys(e).length > 0) {
      toast.error("Vui lòng kiểm tra lại các trường đang bị đánh dấu lỗi");
      return;
    }
    const payload: Omit<VoucherDef, "id"> = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      // Persist undefined instead of "" so date window logic stays clean.
      startAt: draft.startAt || undefined,
      endAt: draft.endAt || undefined,
    };
    if (editing) {
      voucherActions.update(editing.id, payload);
      toast.success(`Đã cập nhật ${payload.code}`);
    } else {
      voucherActions.create(payload);
      toast.success(`Đã thêm voucher ${payload.code}`);
    }
    setOpen(false);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    voucherActions.remove(confirmDelete.id);
    toast.success(`Đã xóa ${confirmDelete.code}`);
    setConfirmDelete(null);
  };

  return (
    <div>
      <PageHeader
        title="Voucher / Mã giảm giá"
        description="Quản lý mã giảm giá khách nhập trong trang thanh toán"
        actions={
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> Thêm voucher
          </button>
        }
      />

      {vouchers.length === 0 ? (
        <EmptyState icon={Tag} title="Chưa có voucher nào" description="Thêm voucher đầu tiên để khách áp dụng khi thanh toán." />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Mã</th>
                <th className="text-left px-3 py-2 font-semibold">Mô tả</th>
                <th className="text-right px-3 py-2 font-semibold">Đơn tối thiểu</th>
                <th className="text-right px-3 py-2 font-semibold">Giảm</th>
                <th className="text-left px-3 py-2 font-semibold">Hiệu lực</th>
                <th className="text-center px-3 py-2 font-semibold">Trạng thái</th>
                <th className="text-right px-3 py-2 font-semibold w-1">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 font-mono font-semibold">{v.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">{v.ruleSummary || "—"}</td>
                  <td className="px-3 py-2 text-right">{v.minSubtotal > 0 ? formatVND(v.minSubtotal) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {v.percent > 0
                      ? `${v.percent}%${v.cap > 0 ? ` (tối đa ${formatVND(v.cap)})` : ""}`
                      : formatVND(v.fixedAmount)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {v.startAt || v.endAt
                      ? `${v.startAt || "…"} → ${v.endAt || "…"}`
                      : "Không giới hạn"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={v.active ? "active" : "inactive"} label={v.active ? "Đang dùng" : "Tắt"} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => voucherActions.toggleActive(v.id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title={v.active ? "Tạm tắt" : "Kích hoạt"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => startEdit(v)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
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
      )}

      <FormDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Sửa voucher ${editing.code}` : "Thêm voucher mới"}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-md border text-sm">Hủy</button>
            <button
              onClick={save}
              disabled={touched && hasErrors}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Lưu
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
              maxLength={20}
              className="font-mono"
              aria-invalid={!!errors.code}
            />
          </FormField>

          <FormField label="Mô tả hiển thị">
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

          <div className="grid grid-cols-2 gap-3">
            <FormField label="% giảm" error={errors.percent}>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.percent}
                onChange={(e) => {
                  const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                  setDraft({ ...draft, percent: v, fixedAmount: v > 0 ? 0 : draft.fixedAmount });
                  setTouched(true);
                }}
                aria-invalid={!!errors.percent}
              />
            </FormField>
            <FormField label="Cap % (VND)" error={errors.cap}>
              <Input
                type="number"
                min={0}
                value={draft.cap}
                onChange={(e) => {
                  setDraft({ ...draft, cap: Math.max(0, Number(e.target.value) || 0) });
                  setTouched(true);
                }}
                disabled={draft.percent === 0}
                aria-invalid={!!errors.cap}
              />
            </FormField>
          </div>

          <FormField label="Hoặc giảm cố định (VND)" error={errors.fixedAmount} hint="Chỉ dùng khi % giảm = 0.">
            <Input
              type="number"
              min={0}
              value={draft.fixedAmount}
              onChange={(e) => {
                setDraft({ ...draft, fixedAmount: Math.max(0, Number(e.target.value) || 0) });
                setTouched(true);
              }}
              disabled={draft.percent > 0}
              aria-invalid={!!errors.fixedAmount}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bắt đầu" hint="Để trống = áp dụng ngay">
              <Input
                type="date"
                value={draft.startAt ?? ""}
                onChange={(e) => {
                  setDraft({ ...draft, startAt: e.target.value });
                  setTouched(true);
                }}
              />
            </FormField>
            <FormField label="Kết thúc" error={errors.endAt} hint="Để trống = không giới hạn">
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
              <p className="text-sm font-medium">Kích hoạt</p>
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
        onConfirm={doDelete}
        title="Xóa voucher?"
        description={confirmDelete ? `Mã ${confirmDelete.code} sẽ bị xóa. Hành động không thể hoàn tác.` : ""}
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
