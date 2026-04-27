import type { VietQrRequest, VietQrResult } from "@/services/types";

export interface VietQrService {
  generate(request: VietQrRequest): Promise<VietQrResult>;
}
