import { describe, expect, it } from "vitest";

import { normalizePhone } from "./phone";
import { isValidTimeZone, parseLocalDateTime, taskWindows } from "./tasks";

describe("normalizePhone", () => {
  it("reduces formatting differences to the same digits", () => {
    expect(normalizePhone("+1 (555) 010-2000")).toBe("15550102000");
    expect(normalizePhone("1-555-010-2000")).toBe("15550102000");
    expect(normalizePhone("00 1 555 010 2000")).toBe("15550102000");
  });

  it("ignores values that are too short or empty", () => {
    expect(normalizePhone("12-34")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("taskWindows", () => {
  it("computes today's boundaries in the user's time zone", () => {
    const now = new Date("2026-10-14T20:00:00Z"); // 04:00 on Oct 15 in Taipei
    const windows = taskWindows(now, "Asia/Taipei");
    expect(windows.startOfToday.toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(windows.endOfToday.toISOString()).toBe("2026-10-15T15:59:59.999Z");
    expect(windows.endOfUpcoming.toISOString()).toBe("2026-10-22T15:59:59.999Z");
  });

  it("falls back to UTC for unknown zones", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    const windows = taskWindows(new Date("2026-10-14T20:00:00Z"), "Mars/Olympus");
    expect(windows.startOfToday.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });
});

describe("parseLocalDateTime", () => {
  it("reads datetime-local values in the given zone", () => {
    expect(parseLocalDateTime("2026-10-14T09:30", "Asia/Taipei").toISOString()).toBe(
      "2026-10-14T01:30:00.000Z",
    );
    expect(parseLocalDateTime("2026-10-14T09:30", "UTC").toISOString()).toBe(
      "2026-10-14T09:30:00.000Z",
    );
  });

  it("passes full ISO strings through", () => {
    expect(parseLocalDateTime("2026-10-14T09:30:00Z", "Asia/Taipei").toISOString()).toBe(
      "2026-10-14T09:30:00.000Z",
    );
  });
});
