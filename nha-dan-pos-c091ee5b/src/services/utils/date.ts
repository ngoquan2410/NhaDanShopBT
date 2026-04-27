import type { ISODateString } from "@/services/types";

export const nowIso = (): ISODateString => new Date().toISOString();

export const addHoursIso = (hours: number, base: Date = new Date()): ISODateString =>
  new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();

export const parseIso = (s: ISODateString): Date => new Date(s);
