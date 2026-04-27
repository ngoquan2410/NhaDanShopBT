export interface VietQrBankOption {
  code: string;
  bin: string;
  name: string;
}

export const VIETQR_BANKS: VietQrBankOption[] = [
  { code: "VCB", bin: "970436", name: "Vietcombank" },
  { code: "TCB", bin: "970407", name: "Techcombank" },
  { code: "ACB", bin: "970416", name: "ACB" },
  { code: "MB", bin: "970422", name: "MB Bank" },
  { code: "BIDV", bin: "970418", name: "BIDV" },
  { code: "VPB", bin: "970432", name: "VPBank" },
  { code: "TPB", bin: "970423", name: "TPBank" },
  { code: "STB", bin: "970403", name: "Sacombank" },
  { code: "SHB", bin: "970443", name: "SHB" },
  { code: "VIB", bin: "970441", name: "VIB" },
  { code: "VBA", bin: "970405", name: "Agribank" },
  { code: "OCB", bin: "970448", name: "OCB" },
];

export function sanitizeBankAccountNumber(input: string): string {
  return (input || "").replace(/\D/g, "");
}

export function resolveVietQrBank(input: string): VietQrBankOption | undefined {
  const value = (input || "").trim().toUpperCase();
  if (!value) return undefined;
  return VIETQR_BANKS.find((bank) => bank.code === value || bank.bin === value);
}

export function normalizeVietQrBankId(input: string): string {
  return resolveVietQrBank(input)?.bin ?? (input || "").trim();
}

export function isPlausibleBankAccountNumber(input: string): boolean {
  return /^\d{6,19}$/.test(sanitizeBankAccountNumber(input));
}