import { describe, it, expect, vi, afterEach } from "vitest";
import {
  addLocalCalendarDays,
  isValidDateInput,
  parseLocalDateInput,
  toLocalDateString,
  localToday,
} from "./localDate";

describe("localDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toLocalDateString uses local calendar parts, not UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 23, 0, 0));
    expect(toLocalDateString()).toBe("2026-05-10");
    expect(toLocalDateString(new Date(2026, 4, 10, 3, 0, 0))).toBe("2026-05-10");
  });

  it("localToday matches toLocalDateString(new Date())", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(localToday()).toBe("2026-01-01");
  });

  it("parseLocalDateInput + format preserves same calendar day", () => {
    const d = parseLocalDateInput("2026-05-10");
    expect(toLocalDateString(d)).toBe("2026-05-10");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(10);
  });

  it("isValidDateInput rejects non calendar dates", () => {
    expect(isValidDateInput("2026-05-10")).toBe(true);
    expect(isValidDateInput("2026-13-01")).toBe(false);
    expect(isValidDateInput("")).toBe(false);
  });

  it("addLocalCalendarDays adds civil days in local time", () => {
    expect(addLocalCalendarDays("2026-05-10", 7)).toBe("2026-05-17");
    expect(addLocalCalendarDays("2026-05-10", -1)).toBe("2026-05-09");
  });

  it("late evening local still formats as same local calendar day", () => {
    expect(toLocalDateString(new Date(2026, 4, 10, 22, 30, 0))).toBe("2026-05-10");
  });
});
