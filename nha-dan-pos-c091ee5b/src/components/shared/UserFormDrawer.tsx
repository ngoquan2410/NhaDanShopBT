import { useEffect, useMemo, useState } from "react";
import { FormDrawer, Field } from "./FormDrawer";
import { userActions } from "@/lib/store";
import type { UserAccount } from "@/lib/mock-data";
import { toast } from "sonner";
import { validateRequired } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  user?: UserAccount | null;
}

const inputCls = "w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

function validateUsername(v: string): string | null {
  const t = (v || "").trim();
  if (!t) return "Vui lòng nhập username";
  if (t.length < 3) return "Username phải có tối thiểu 3 ký tự";
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return "Username chỉ chứa chữ, số, . _ -";
  return null;
}

export function UserFormDrawer({ open, onClose, user }: Props) {
  const [form, setForm] = useState({
    username: "", fullName: "", role: "staff" as UserAccount["role"], active: true, totpEnabled: false,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) setForm({ username: user.username, fullName: user.fullName, role: user.role, active: user.active, totpEnabled: user.totpEnabled });
    else setForm({ username: "", fullName: "", role: "staff", active: true, totpEnabled: false });
    setTouched({});
  }, [user, open]);

  const errors = useMemo(() => ({
    fullName: validateRequired(form.fullName, "Họ tên"),
    username: user ? null : validateUsername(form.username),
  }), [form, user]);

  const isValid = !errors.fullName && !errors.username;
  const showErr = (k: keyof typeof errors) => touched[k] && errors[k];

  const submit = () => {
    setTouched({ fullName: true, username: true });
    if (!isValid) { toast.error("Vui lòng kiểm tra lại thông tin"); return; }
    if (user) {
      userActions.update(user.id, form);
      toast.success("Đã cập nhật người dùng");
    } else {
      userActions.create(form);
      toast.success("Đã thêm người dùng");
    }
    onClose();
  };

  return (
    <FormDrawer
      open={open} onClose={onClose}
      title={user ? "Sửa người dùng" : "Thêm người dùng"}
      description={user ? `@${user.username}` : "Tạo tài khoản mới"}
      footer={<>
        <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">Hủy</button>
        <button
          onClick={submit}
          disabled={!isValid && Object.keys(touched).length > 0}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {user ? "Cập nhật" : "Thêm mới"}
        </button>
      </>}
    >
      <div className="space-y-4">
        <Field label="Họ tên" required>
          <input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} onBlur={() => setTouched(t => ({ ...t, fullName: true }))} className={cn(inputCls, showErr('fullName') && "border-danger")} />
          {showErr('fullName') && <p className="text-[11px] text-danger mt-1">{errors.fullName}</p>}
        </Field>
        <Field label="Username" required hint={user ? "Không thể đổi username" : "Dùng để đăng nhập (3+ ký tự, chữ/số/._-)"}>
          <input value={form.username} disabled={!!user} onChange={e => setForm({ ...form, username: e.target.value })} onBlur={() => setTouched(t => ({ ...t, username: true }))} className={cn(inputCls, showErr('username') && "border-danger")} />
          {showErr('username') && <p className="text-[11px] text-danger mt-1">{errors.username}</p>}
        </Field>
        {!user && <Field label="Mật khẩu tạm" hint="Người dùng sẽ đổi mật khẩu lần đăng nhập đầu">
          <input type="password" placeholder="••••••" className={inputCls} />
        </Field>}
        <Field label="Vai trò">
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserAccount["role"] })} className={inputCls}>
            <option value="staff">Nhân viên</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
            Đang hoạt động
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.totpEnabled} onChange={e => setForm({ ...form, totpEnabled: e.target.checked })} />
            Yêu cầu xác thực 2 bước (TOTP)
          </label>
        </div>
      </div>
    </FormDrawer>
  );
}
