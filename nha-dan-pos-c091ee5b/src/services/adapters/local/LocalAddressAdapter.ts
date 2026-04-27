import vnAddress from "./data/vn-address.json";
import type { AddressService } from "@/services/addresses/AddressService";
import type { Province, District, Ward } from "@/services/types";

interface VnAddressData {
  provinces: Province[];
  districts: District[];
  wards: Ward[];
}

const data = vnAddress as VnAddressData;

export class LocalAddressAdapter implements AddressService {
  async listProvinces(): Promise<Province[]> {
    return [...data.provinces].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }
  async listDistricts(provinceCode: string): Promise<District[]> {
    return data.districts
      .filter((d) => d.provinceCode === provinceCode)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }
  async listWards(districtCode: string): Promise<Ward[]> {
    return data.wards
      .filter((w) => w.districtCode === districtCode)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }
}
