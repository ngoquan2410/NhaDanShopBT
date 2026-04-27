import type { AddressService } from "@/services/addresses/AddressService";
import type { Province, District, Ward } from "@/services/types";

/**
 * Try the remote adapter first; on any failure (network/timeout/parse),
 * fall back to the local adapter so the UI keeps working offline.
 * Logs a single console warning per session per method to avoid noise.
 */
export class HybridAddressAdapter implements AddressService {
  private warned = new Set<string>();

  constructor(
    private readonly remote: AddressService,
    private readonly local: AddressService,
  ) {}

  private warnOnce(method: string, err: unknown): void {
    if (this.warned.has(method)) return;
    this.warned.add(method);
    // eslint-disable-next-line no-console
    console.warn(
      `[AddressService] Remote "${method}" failed, falling back to local dataset.`,
      err,
    );
  }

  async listProvinces(): Promise<Province[]> {
    try {
      return await this.remote.listProvinces();
    } catch (err) {
      this.warnOnce("listProvinces", err);
      return this.local.listProvinces();
    }
  }

  async listDistricts(provinceCode: string): Promise<District[]> {
    try {
      return await this.remote.listDistricts(provinceCode);
    } catch (err) {
      this.warnOnce("listDistricts", err);
      return this.local.listDistricts(provinceCode);
    }
  }

  async listWards(districtCode: string): Promise<Ward[]> {
    try {
      return await this.remote.listWards(districtCode);
    } catch (err) {
      this.warnOnce("listWards", err);
      return this.local.listWards(districtCode);
    }
  }
}
