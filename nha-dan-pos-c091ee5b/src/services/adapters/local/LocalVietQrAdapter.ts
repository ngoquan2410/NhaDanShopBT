import type { StoreSettingsService } from "@/services/storeSettings/StoreSettingsService";
import type { VietQrService } from "@/services/vietQr/VietQrService";
import type { VietQrRequest, VietQrResult, VietQrTemplate } from "@/services/types";
import { isPlausibleBankAccountNumber, normalizeVietQrBankId, sanitizeBankAccountNumber } from "@/lib/vietqr";

/**
 * NAPAS / VietQR field 59 (account name) requires plain ASCII, uppercase,
 * limited length. Vietnamese diacritics or punctuation here cause some bank
 * apps (ACB, MBBank, …) to reject the payload with "Không tìm thấy dữ liệu".
 * Same applies to the transfer content (field 62-08 addInfo).
 */
function sanitizeAscii(input: string, maxLen: number): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

/**
 * VietQR image generator using img.vietqr.io.
 * Reads bank settings from StoreSettingsService — does not own them.
 * URL: https://img.vietqr.io/image/{bank}-{account}-{template}.png?amount=&addInfo=&accountName=
 */
export class LocalVietQrAdapter implements VietQrService {
  constructor(private settings: StoreSettingsService) {}

  async generate(request: VietQrRequest): Promise<VietQrResult> {
    const s = await this.settings.getPaymentSettings();
    if (!s || !s.qrEnabled || !s.vietQrBankCode || !s.accountNumber) {
      throw new Error("VietQR chưa được cấu hình. Vào 'Cài đặt cửa hàng' để thiết lập.");
    }
    const bankId = normalizeVietQrBankId(s.vietQrBankCode);
    const accountNumber = sanitizeBankAccountNumber(s.accountNumber);
    if (!bankId || !isPlausibleBankAccountNumber(accountNumber)) {
      throw new Error("Tài khoản thụ hưởng không hợp lệ. Cửa hàng cần kiểm tra lại ngân hàng và số tài khoản nhận tiền.");
    }
    const template: VietQrTemplate = s.qrTemplate ?? "compact2";
    // Sanitize for NAPAS spec: ASCII uppercase, no diacritics, length-bounded.
    const safeAccountName = sanitizeAscii(s.accountName ?? "", 25);
    const safeAddInfo = sanitizeAscii(request.transferContent, 25);
    const params = new URLSearchParams({
      amount: String(Math.max(0, Math.round(request.amount))),
      addInfo: safeAddInfo,
      accountName: safeAccountName,
    });
    if (request.cacheKey) {
      params.set("_v", request.cacheKey);
    }
    const imageUrl = `https://img.vietqr.io/image/${encodeURIComponent(
      bankId
    )}-${encodeURIComponent(accountNumber)}-${template}.png?${params.toString()}`;
    const scanImageUrl = `https://img.vietqr.io/image/${encodeURIComponent(
      bankId
    )}-${encodeURIComponent(accountNumber)}-qr_only.png?${params.toString()}`;

    return {
      imageUrl,
      scanImageUrl,
      rawPayload: imageUrl,
      bankName: s.bankName,
      accountNumber,
      accountName: s.accountName,
      amount: request.amount,
      transferContent: safeAddInfo,
      template,
    };
  }
}
