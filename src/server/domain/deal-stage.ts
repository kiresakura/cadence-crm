import type { StageType } from "@/generated/prisma/enums";

import { ValidationError } from "../errors";

export interface StageTransitionResult {
  closedAt: Date | null;
  lostReason: string | null;
}

/**
 * Applies the close rules when a deal enters a stage:
 * - OPEN reopens the deal (clears closedAt and lostReason).
 * - WON closes it and clears any lost reason.
 * - LOST closes it and requires a reason.
 * A deal that stays closed with the same outcome keeps its original close time.
 */
export function resolveStageTransition(
  target: { type: StageType },
  current: { type: StageType; closedAt: Date | null } | null,
  lostReason: string | null | undefined,
  now: Date,
): StageTransitionResult {
  const keepClosedAt =
    current && current.type === target.type && current.closedAt ? current.closedAt : now;

  switch (target.type) {
    case "OPEN":
      return { closedAt: null, lostReason: null };
    case "WON":
      return { closedAt: keepClosedAt, lostReason: null };
    case "LOST": {
      const reason = lostReason?.trim();
      if (!reason) {
        throw ValidationError.forField("lostReason", "Give a reason when marking a deal as lost.");
      }
      return { closedAt: keepClosedAt, lostReason: reason };
    }
  }
}

/** Every pipeline needs somewhere to work deals, somewhere to win them and somewhere to lose them. */
export function assertStageSetComplete(stages: ReadonlyArray<{ type: StageType }>): void {
  const types = new Set(stages.map((stage) => stage.type));
  const missing = (["OPEN", "WON", "LOST"] as const).filter((type) => !types.has(type));
  if (missing.length > 0) {
    throw new ValidationError(
      `A pipeline needs at least one ${missing.join(", ")} stage.`.replace(/, (?=[^,]*$)/, " and "),
    );
  }
}

export const DEFAULT_STAGES: ReadonlyArray<{ name: string; probability: number; type: StageType }> =
  [
    { name: "Lead in", probability: 10, type: "OPEN" },
    { name: "Qualified", probability: 25, type: "OPEN" },
    { name: "Proposal", probability: 50, type: "OPEN" },
    { name: "Negotiation", probability: 75, type: "OPEN" },
    { name: "Won", probability: 100, type: "WON" },
    { name: "Lost", probability: 0, type: "LOST" },
  ];
