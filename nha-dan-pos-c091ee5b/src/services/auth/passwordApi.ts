import { adminFetchJson, AdminApiError } from "@/services/auth/adminApi";

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AdminResetPasswordInput {
  newPassword: string;
  confirmPassword: string;
}

export const passwordApi = {
  changePassword: (input: ChangePasswordInput) =>
    adminFetchJson<Record<string, never>>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  adminResetPassword: (userId: string, input: AdminResetPasswordInput) =>
    adminFetchJson<Record<string, never>>(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

export function mapPasswordError(err: unknown): string {
  if (err instanceof AdminApiError) {
    const data = err.data as { detail?: string; message?: string } | undefined;
    return data?.detail ?? data?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Không thể xử lý mật khẩu";
}
