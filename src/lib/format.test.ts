import { describe, expect, it } from "vitest";

import { formatMoney, fullName } from "./format";

describe("fullName", () => {
  it("writes Latin names given name first", () => {
    expect(fullName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
  });

  it("writes Chinese, Japanese and Korean names family name first without a space", () => {
    expect(fullName({ firstName: "小明", lastName: "王" })).toBe("王小明");
    expect(fullName({ firstName: "太郎", lastName: "山田" })).toBe("山田太郎");
    expect(fullName({ firstName: "민준", lastName: "김" })).toBe("김민준");
  });
});

describe("formatMoney", () => {
  it("shows whole amounts without decimals and others with exactly two", () => {
    expect(formatMoney(12500, "USD")).toBe("$12,500");
    expect(formatMoney("1234.5", "USD")).toBe("$1,234.50");
    expect(formatMoney(1000000000877258.5, "USD")).toBe("$1,000,000,000,877,258.50");
    expect(formatMoney(0.1, "EUR")).toBe("€0.10");
  });
});
