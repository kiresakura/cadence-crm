import { describe, expect, it } from "vitest";

import { ValidationError } from "../errors";
import { DEFAULT_STAGES, assertStageSetComplete, resolveStageTransition } from "./deal-stage";

const now = new Date("2026-10-14T12:00:00Z");
const earlier = new Date("2026-09-01T08:00:00Z");

describe("resolveStageTransition", () => {
  it("keeps open deals open", () => {
    expect(
      resolveStageTransition({ type: "OPEN" }, { type: "OPEN", closedAt: null }, null, now),
    ).toEqual({
      closedAt: null,
      lostReason: null,
    });
  });

  it("closes a deal as won and clears any lost reason", () => {
    expect(
      resolveStageTransition({ type: "WON" }, { type: "OPEN", closedAt: null }, "ignored", now),
    ).toEqual({
      closedAt: now,
      lostReason: null,
    });
  });

  it("requires a reason to mark a deal lost", () => {
    expect(() => resolveStageTransition({ type: "LOST" }, null, "  ", now)).toThrow(
      ValidationError,
    );
    try {
      resolveStageTransition({ type: "LOST" }, null, undefined, now);
    } catch (error) {
      expect((error as ValidationError).fieldErrors).toHaveProperty("lostReason");
    }
    expect(resolveStageTransition({ type: "LOST" }, null, " Budget cut ", now)).toEqual({
      closedAt: now,
      lostReason: "Budget cut",
    });
  });

  it("reopens a closed deal", () => {
    expect(
      resolveStageTransition({ type: "OPEN" }, { type: "LOST", closedAt: earlier }, "old", now),
    ).toEqual({ closedAt: null, lostReason: null });
  });

  it("keeps the original close time when the outcome does not change", () => {
    expect(
      resolveStageTransition({ type: "WON" }, { type: "WON", closedAt: earlier }, null, now),
    ).toEqual({
      closedAt: earlier,
      lostReason: null,
    });
  });

  it("uses a new close time when switching from lost to won", () => {
    expect(
      resolveStageTransition({ type: "WON" }, { type: "LOST", closedAt: earlier }, null, now)
        .closedAt,
    ).toEqual(now);
  });
});

describe("assertStageSetComplete", () => {
  it("accepts the default stages", () => {
    expect(() => assertStageSetComplete(DEFAULT_STAGES)).not.toThrow();
  });

  it("names the missing stage types", () => {
    expect(() => assertStageSetComplete([{ type: "OPEN" }])).toThrow(
      "A pipeline needs at least one WON and LOST stage.",
    );
    expect(() => assertStageSetComplete([{ type: "WON" }, { type: "LOST" }])).toThrow(
      "A pipeline needs at least one OPEN stage.",
    );
  });
});
