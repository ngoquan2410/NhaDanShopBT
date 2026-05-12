import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateInput } from "./DateInput";

describe("DateInput", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("max date is local today, not UTC ISO date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 20, 0, 0));
    const onChange = vi.fn();
    render(<DateInput value="2026-05-01" onChange={onChange} />);
    const input = screen.getByDisplayValue("2026-05-01");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("max", "2026-05-10");
  });

  it("allowFuture omits max so expiry fields are not capped to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12, 0, 0));
    render(<DateInput allowFuture value="2026-12-31" onChange={() => {}} />);
    const input = screen.getByDisplayValue("2026-12-31");
    expect(input.getAttribute("max")).toBeNull();
  });
});
