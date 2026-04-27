import { useEffect, useMemo, useState } from "react";
import { FormDrawer, Field } from "./FormDrawer";
import { customerActions } from "@/lib/store";
import type { Customer } from "@/lib/mock-data";
import { toast } from "sonner";
import { validatePhone, validateEmail, validateRequired, normalizePhone } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

const inputCls = "w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring";

export function CustomerFormDrawer({ open, onClose, customer }: Props) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", group: "retail" as Customer["group"], active: true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (customer) setForm({ name: customer.name, phone: customer.phone, email: customer.email ?? "", group: customer.group, active: customer.active });
    else setForm({ name: "", phone: "", email: "", group: "retail", active: true });
    setTouched({});
  }, [customer, open]);

  const errors = useMemo(() => ({
    name: validateRequired(form.name, "Họ tên"),
    phone: validatePhone(form.phone),
    email: validateEmail(form.email, false),
  }), [form]);

  const isValid = !errors.name && !errors.phone && !errors.email;
  const showErr = (k: keyof typeof errors) => touched[k] && errors[k];

  const submit = () => {
    setTouched({ name: true, phone: true, email: true });
    if (!isValid) { toast.error("Vui lòng kiểm tra lại thông tin"); return; }
    const payload = { ...form, phone: normalizePhone(form.phone), email: form.email.trim() || undefined };
    if (customer) {
      customerActions.update(customer.id, payload);
      toast.success("Đã cập nhật khách hàng");
    } else {
      customerActions.create(payload);
      toast.success("Đã thêm khách hàng");
    }
    onClose();
  };

  return (
    <FormDrawer
      open={open} onClose={onClose}
      title={customer ? "Sửa khách hàng" : "Thêm khách hàng"}
      description={customer ? `Mã: ${customer.code}` : "Tạo khách hàng mới"}
      footer={<>
        <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">Hủy</button>
        <button
          onClick={submit}
          disabled={!isValid && Object.keys(touched).length > 0}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {customer ? "Cập nhật" : "Thêm mới"}
        </button>
      </>}
    >
      <div className="space-y-4">
        <Field label="Họ tên" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onBlur={() => setTouched(t => ({ ...t, name: true }))} className={cn(inputCls, showErr('name') && "border-danger")} placeholder="Nguyễn Văn A" />
          {showErr('name') && <p className="text-[11px] text-danger mt-1">{errors.name}</p>}
        </Field>
        <Field label="Số điện thoại" required>
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} onBlur={() => setTouched(t => ({ ...t, phone: true }))} className={cn(inputCls, showErr('phone') && "border-danger")} placeholder="0901234567" inputMode="tel" />
          {showErr('phone') && <p className="text-[11px] text-danger mt-1">{errors.phone}</p>}
        </Field>
        <Field label="Email">
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched(t => ({ ...t, email: true }))} className={cn(inputCls, showErr('email') && "border-danger")} placeholder="email@example.com" inputMode="email" />
          {showErr('email') && <p className="text-[11px] text-danger mt-1">{errors.email}</p>}
        </Field>
        <Field label="Nhóm khách hàng">
          <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value as Customer["group"] })} className={inputCls}>
            <option value="retail">Lẻ</option>
            <option value="wholesale">Sỉ</option>
            <option value="vip">VIP</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
          Đang hoạt động
        </label>
      </div>
    </FormDrawer>
  );
}
