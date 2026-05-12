import { useEffect, useMemo, useState } from "react";
import { FormDrawer, Field } from "./FormDrawer";
import type { UserAccount } from "@/lib/mock-data";
import { toast } from "sonner";
import { validateRequired } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminRoles } from "@/services";
import type { AdminRoleOption } from "@/services/adminBackend";

interface Props {
  open: boolean;
  onClose: () => void;
  user?: UserAccount | null;
  onSave: (input: Partial<UserAccount> & Pick<UserAccount, "fullName"> & { password?: string; roleName: string }) => Promise<void>;
}

const inputCls = "w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60";

function validateUsername(v: string): string | null {
  const t = (v || "").trim();
  if (!t) return "Vui lòng nhập username";
  if (t.length < 3) return "Username phải có tối thiểu 3 ký tự";
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return "Username chỉ chứa chữ, số, . _ -";
  return null;
}

export function UserFormDrawer({ open, onClose, user, onSave }: Props) {
  const [form, setForm] = useState({
    username: "", fullName: "", roleName: "ROLE_STAFF", active: true, totpEnabled: false, password: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [roleOptions, setRoleOptions] = useState<AdminRoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username,
        fullName: user.fullName,
        roleName: user.backendRoleName ?? (user.role === "admin" ? "ROLE_ADMIN" : "ROLE_STAFF"),
        active: user.active,
        totpEnabled: user.totpEnabled,
        password: "",
      });
    } else {
      setForm({ username: "", fullName: "", roleName: "ROLE_STAFF", active: true, totpEnabled: false, password: "" });
    }
    setTouched({});
  }, [user, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRolesLoading(true);
    setRolesError(null);
    adminRoles.list()
      .then((rows) => {
        if (cancelled) return;
        setRoleOptions(rows);
        if (!user && rows.some((r) => r.name === "ROLE_STAFF")) {
          setForm((prev) => ({ ...prev, roleName: "ROLE_STAFF" }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setRolesError(err instanceof Error ? err.message : "Không tải được danh sách vai trò");
        setRoleOptions([]);
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, user]);

  const errors = useMemo(() => ({
    fullName: validateRequired(form.fullName, "Họ tên"),
    username: user ? null : validateUsername(form.username),
  }), [form, user]);

  const isValid = !errors.fullName && !errors.username;
  const showErr = (k: keyof typeof errors) => touched[k] && errors[k];

  const submit = async () => {
    setTouched({ fullName: true, username: true });
    if (!isValid) { toast.error("Vui lòng kiểm tra lại thông tin"); return; }
    if (rolesLoading) { toast.error("Danh sách vai trò đang tải"); return; }
    if (rolesError) { toast.error("Không thể lưu vì chưa tải được vai trò"); return; }
    if (!form.roleName) { toast.error("Vui lòng chọn vai trò"); return; }
    try {
      await onSave({ ...form, id: user?.id });
      toast.success(user ? "Đã cập nhật người dùng" : "Đã thêm người dùng");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể lưu người dùng");
    }
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
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" className={inputCls} />
        </Field>}
        <Field label="Vai trò">
          <Select
            value={form.roleName}
            onValueChange={(v) => setForm({ ...form, roleName: v })}
            disabled={rolesLoading || !!rolesError}
          >
            <SelectTrigger className="w-full h-9 text-sm">
              <SelectValue placeholder={rolesLoading ? "Đang tải vai trò..." : "Chọn vai trò"} />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((role) => (
                <SelectItem key={role.id || role.name} value={role.name}>{role.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rolesError && <p className="text-[11px] text-danger mt-1">Không tải được vai trò: {rolesError}</p>}
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
