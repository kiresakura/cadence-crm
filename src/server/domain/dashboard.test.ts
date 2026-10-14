import { describe, expect, it } from "vitest";

import { computeDashboardMetrics, monthKey, type DashboardStage } from "./dashboard";

const stages: DashboardStage[] = [
  { id: "lead", name: "Lead", type: "OPEN", probability: 10, position: 0, pipelineId: "p1" },
  {
    id: "proposal",
    name: "Proposal",
    type: "OPEN",
    probability: 50,
    position: 1,
    pipelineId: "p1",
  },
  { id: "won", name: "Won", type: "WON", probability: 100, position: 2, pipelineId: "p1" },
  { id: "lost", name: "Lost", type: "LOST", probability: 0, position: 3, pipelineId: "p1" },
  { id: "other", name: "Other open", type: "OPEN", probability: 20, position: 0, pipelineId: "p2" },
];

const now = new Date("2026-10-14T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

const deals = [
  {
    amount: "1000.00",
    currency: "USD",
    stageId: "lead",
    closedAt: null,
    expectedCloseDate: date("2026-10-30"),
  },
  {
    amount: "2000.50",
    currency: "USD",
    stageId: "proposal",
    closedAt: null,
    expectedCloseDate: date("2026-11-02"),
  },
  {
    amount: "500",
    currency: "USD",
    stageId: "other",
    closedAt: null,
    expectedCloseDate: date("2026-10-01"),
  },
  { amount: "9999", currency: "EUR", stageId: "proposal", closedAt: null, expectedCloseDate: null },
  {
    amount: "3000",
    currency: "USD",
    stageId: "won",
    closedAt: new Date(now.getTime() - 10 * day),
    expectedCloseDate: null,
  },
  {
    amount: "4000",
    currency: "USD",
    stageId: "won",
    closedAt: new Date("2026-06-15T00:00:00Z"),
    expectedCloseDate: null,
  },
  {
    amount: "700",
    currency: "USD",
    stageId: "lost",
    closedAt: new Date(now.getTime() - 30 * day),
    expectedCloseDate: null,
  },
  {
    amount: "800",
    currency: "USD",
    stageId: "lost",
    closedAt: new Date(now.getTime() - 95 * day),
    expectedCloseDate: null,
  },
];

describe("computeDashboardMetrics", () => {
  const metrics = computeDashboardMetrics({
    deals,
    stages,
    chartStages: stages.filter((stage) => stage.pipelineId === "p1"),
    currency: "USD",
    now,
    timeZone: "UTC",
  });

  it("sums open pipeline value in the reporting currency", () => {
    expect(metrics.openPipeline).toEqual({ amount: 3500.5, count: 3 });
    expect(metrics.excludedOtherCurrency).toBe(1);
  });

  it("weights open deals by stage probability", () => {
    // 1000 * 10% + 2000.50 * 50% + 500 * 20%
    expect(metrics.weightedForecast).toBe(1200.25);
  });

  it("computes the win rate over the last 90 days", () => {
    expect(metrics.winRate90d).toEqual({ won: 1, lost: 1, rate: 0.5 });
  });

  it("counts open deals expected to close this month", () => {
    expect(metrics.closingThisMonth).toEqual({ amount: 1500, count: 2 });
  });

  it("breaks open value down by stage of the chart pipeline", () => {
    expect(metrics.byStage).toEqual([
      { stageId: "lead", name: "Lead", count: 1, amount: 1000, weighted: 100 },
      { stageId: "proposal", name: "Proposal", count: 1, amount: 2000.5, weighted: 1000.25 },
    ]);
  });

  it("buckets won revenue by month for the last six months", () => {
    expect(metrics.wonByMonth).toEqual([
      { month: "2026-05", amount: 0 },
      { month: "2026-06", amount: 4000 },
      { month: "2026-07", amount: 0 },
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 0 },
      { month: "2026-10", amount: 3000 },
    ]);
  });

  it("returns a null win rate when nothing closed recently", () => {
    const empty = computeDashboardMetrics({
      deals: [],
      stages,
      currency: "USD",
      now,
      timeZone: "UTC",
    });
    expect(empty.winRate90d.rate).toBeNull();
    expect(empty.byStage.map((stage) => stage.stageId)).toEqual(["lead", "other", "proposal"]);
  });
});

describe("monthKey", () => {
  it("respects the time zone", () => {
    const instant = new Date("2026-10-31T20:00:00Z");
    expect(monthKey(instant, "UTC")).toBe("2026-10");
    expect(monthKey(instant, "Asia/Taipei")).toBe("2026-11");
  });
});
