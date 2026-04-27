import { useEffect, useMemo, useState } from "react";
import { FormDrawer, Field } from "./FormDrawer";
import { supplierActions } from "@/lib/store";
import type { Supplier } from "@/lib/mock-data";
import { toast } from "sonner";
import { validatePhone, validateEmail, validateRequired, normalizePhone } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}

const inputCls = "w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring";

export function SupplierFormDrawer({ open, onClose, supplier }: Props) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", taxCode: "", note: "", active: true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (supplier) setForm({ name: supplier.name, phone: supplier.phone, email: supplier.email, address: supplier.address, taxCode: supplier.taxCode, note: supplier.note ?? "", active: supplier.active });
    else setForm({ name: "", phone: "", email: "", address: "", taxCode: "", note: "", active: true });
    setTouched({});
  }, [supplier, open]);

  const errors = useMemo(() => ({
    name: validateRequired(form.name, "Tên NCC"),
    phone: validatePhone(form.phone),
    email: validateEmail(form.email, false),
  }), [form]);

  const isValid = !errors.name && !errors.phone && !errors.email;
  const showErr = (k: keyof typeof errors) => touched[k] && errors[k];

  const submit = () => {
    setTouched({ name: true, phone: true, email: true });
    if (!isValid) { toast.error("Vui lòng kiểm tra lại thông tin"); return; }
    const payload = { ...form, phone: normalizePhone(form.phone), email: form.email.trim(), note: form.note || undefined };
    if (supplier) {
      supplierActions.update(supplier.id, payload);
      toast.success("Đã cập nhật nhà cung cấp");
    } else {
      supplierActions.create(payload);
      toast.success("Đã thêm nhà cung cấp");
    }
    onClose();
  };

  return (
    <FormDrawer
      open={open} onClose={onClose}
      title={supplier ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
      description={supplier ? `Mã: ${supplier.code}` : "Tạo nhà cung cấp mới"}
      footer={<>
        <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">Hủy</button>
        <button
          onClick={submit}
          disabled={!isValid && Object.keys(touched).length > 0}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {supplier ? "Cập nhật" : "Thêm mới"}
        </button>
      </>}
    >
      <div className="space-y-4">
        <Field label="Tên NCC" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={() => setTouched(t => ({ ...t, name: true }))} className={cn(inputCls, showErr('name') && "border-danger")} />
          {showErr('name') && <p className="text-[11px] text-danger mt-1">{errors.name}</p>}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Số điện thoại" required>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} onBlur={() => setTouched(t => ({ ...t, phone: true }))} className={cn(inputCls, showErr('phone') && "border-danger")} placeholder="0901234567" inputMode="tel" />
            {showErr('phone') && <p className="text-[11px] text-danger mt-1">{errors.phone}</p>}
          </Field>
          <Field label="Mã số thuế"><input value={form.taxCode} onChange={e => setForm({ ...form, taxCode: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="Email">
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched(t => ({ ...t, email: true }))} className={cn(inputCls, showErr('email') && "border-danger")} placeholder="email@example.com" inputMode="email" />
          {showErr('email') && <p className="text-[11px] text-danger mt-1">{errors.email}</p>}
        </Field>
        <Field label="Địa chỉ"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputCls} /></Field>
        <Field label="Ghi chú"><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
          Đang hoạt động
        </label>
      </div>
    </FormDrawer>
  );
}
