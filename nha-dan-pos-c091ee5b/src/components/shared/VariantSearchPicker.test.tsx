import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VariantSearchPicker } from "./VariantSearchPicker";
import type { VariantTransactionSearchHit } from "@/services/catalog/variantTransactionSearch";

const searchMock = vi.fn();

vi.mock("@/services/catalog/variantTransactionSearch", () => ({
  searchVariantsForTransaction: (...args: unknown[]) => searchMock(...args),
}));

function hit(partial: Partial<VariantTransactionSearchHit> & { variantCode: string }): VariantTransactionSearchHit {
  return {
    variantId: "1",
    variantName: "N",
    productId: "p",
    productCode: "PC",
    productName: "PN",
    productType: "SINGLE",
    active: true,
    isSellable: true,
    sellUnit: "cai",
    importUnit: "cai",
    categoryId: "",
    categoryName: "",
    stockQty: 0,
    sellPrice: 0,
    costPrice: 0,
    piecesPerUnit: 1,
    minStockQty: 0,
    expiryDays: null,
    ...partial,
  };
}

describe("VariantSearchPicker", () => {
  afterEach(() => {
    vi.useRealTimers();
    searchMock.mockReset();
  });

  it("does not apply stale search results when an older request resolves after a newer one (reqSeq)", async () => {
    vi.useFakeTimers();
    const resolvers: Array<(v: { items: VariantTransactionSearchHit[]; totalElements: number }) => void> = [];
    searchMock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    });

    render(
      <VariantSearchPicker
        context="receipt"
        onSelect={() => {}}
        inputTestId="variant-q"
        listTestId="variant-hits"
        minChars={2}
      />,
    );

    const input = screen.getByTestId("variant-q");
    await act(async () => {
      fireEvent.change(input, { target: { value: "aa" } });
      fireEvent.focus(input);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(resolvers.length).toBe(1);

    await act(async () => {
      fireEvent.change(input, { target: { value: "bb" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(resolvers.length).toBe(2);

    const second = hit({ variantId: "second", variantCode: "NEWER" });
    const first = hit({ variantId: "first", variantCode: "STALE" });

    await act(async () => {
      resolvers[1]!({ items: [second], totalElements: 1 });
      await Promise.resolve();
    });
    expect(screen.getByText(/NEWER/)).toBeTruthy();
    expect(screen.queryByText(/STALE/)).toBeNull();

    await act(async () => {
      resolvers[0]!({ items: [first], totalElements: 1 });
      await Promise.resolve();
    });
    expect(screen.getByText(/NEWER/)).toBeTruthy();
    expect(screen.queryByText(/STALE/)).toBeNull();
  });
});
