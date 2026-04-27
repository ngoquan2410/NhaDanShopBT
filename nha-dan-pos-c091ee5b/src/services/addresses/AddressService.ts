import type { Province, District, Ward } from "@/services/types";

export interface AddressService {
  listProvinces(): Promise<Province[]>;
  listDistricts(provinceCode: string): Promise<District[]>;
  listWards(districtCode: string): Promise<Ward[]>;
}
