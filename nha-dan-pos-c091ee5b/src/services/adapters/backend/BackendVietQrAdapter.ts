import type { VietQrService } from "@/services/vietQr/VietQrService";
import type { VietQrRequest, VietQrResult } from "@/services/types";
import { generateVietQr } from "@/services/vietQr/vietQrApi";

export class BackendVietQrAdapter implements VietQrService {
  async generate(request: VietQrRequest): Promise<VietQrResult> {
    return generateVietQr(request);
  }
}
