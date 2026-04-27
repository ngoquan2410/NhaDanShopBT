import type { Money } from "@/services/types";

export const toMoney = (n: number): Money => Math.max(0, Math.round(n));
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);
