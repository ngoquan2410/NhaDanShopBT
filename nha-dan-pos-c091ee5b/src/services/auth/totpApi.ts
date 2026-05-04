import { adminFetchJson } from "@/services/auth/adminApi";

export interface TotpSetupDto {
  secret: string;
  otpauthUrl: string;
  qrCodeImage: string;
}

export const totpApi = {
  setup: () => adminFetchJson<TotpSetupDto>("/api/auth/totp/setup", { method: "POST" }),

  enable: (otp: string) =>
    adminFetchJson<{ message?: string }>("/api/auth/totp/enable", {
      method: "POST",
      body: JSON.stringify({ otp }),
    }),

  disable: (otp: string) =>
    adminFetchJson<{ message?: string }>("/api/auth/totp/disable", {
      method: "POST",
      body: JSON.stringify({ otp }),
    }),
};
