import { describe, expect, it } from "vitest";

import { fullName } from "./format";

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
