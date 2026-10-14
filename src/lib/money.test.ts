import { describe, expect, it } from "vitest";

import { otherCurrenciesNote, totalInCurrency } from "./money";

describe("board column totals", () => {
  const column = [
    { amount: "100.10", currency: "USD" },
    { amount: "2000", currency: "TWD" },
    { amount: "1234.5", currency: "JPY" },
    { amount: "0.20", currency: "USD" },
    { amount: 0.1, currency: "USD" },
  ];

  it("adds only deals in the workspace currency", () => {
    expect(totalInCurrency(column, "USD")).toEqual({ amount: 100.4, excluded: 2 });
    expect(totalInCurrency(column, "TWD")).toEqual({ amount: 2000, excluded: 4 });
    expect(totalInCurrency(column, "EUR")).toEqual({ amount: 0, excluded: 5 });
    expect(totalInCurrency([], "USD")).toEqual({ amount: 0, excluded: 0 });
  });

  it("does not depend on which deal comes first", () => {
    expect(totalInCurrency([...column].reverse(), "USD")).toEqual(totalInCurrency(column, "USD"));
  });

  it("describes left-out deals with the right number", () => {
    expect(otherCurrenciesNote(0)).toBeNull();
    expect(otherCurrenciesNote(1)).toBe("+1 deal in another currency not included");
    expect(otherCurrenciesNote(2)).toBe("+2 deals in other currencies not included");
  });
});
