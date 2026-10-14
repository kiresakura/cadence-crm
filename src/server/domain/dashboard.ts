import { Prisma } from "@/generated/prisma/client";
import type { StageType } from "@/generated/prisma/enums";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface DashboardStage {
  id: string;
  name: string;
  type: StageType;
  probability: number;
  position: number;
  pipelineId: string;
}

export interface DashboardDeal {
  amount: Decimal | string | number;
  currency: string;
  stageId: string;
  closedAt: Date | null;
  expectedCloseDate: Date | null;
}

export interface DashboardMetrics {
  currency: string;
  openPipeline: { amount: number; count: number };
  weightedForecast: number;
  winRate90d: { won: number; lost: number; rate: number | null };
  closingThisMonth: { amount: number; count: number };
  byStage: Array<{
    stageId: string;
    name: string;
    count: number;
    amount: number;
    weighted: number;
  }>;
  wonByMonth: Array<{ month: string; amount: number }>;
  excludedOtherCurrency: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM" of an instant in a time zone. */
export function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function previousMonths(current: string, count: number): string[] {
  const [year, month] = current.split("-").map(Number) as [number, number];
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

const toNumber = (value: Decimal) => Number(value.toFixed(2));

/**
 * Pure dashboard math so it can be unit tested without a database.
 *
 * Only deals in the workspace reporting currency are aggregated (amounts in different
 * currencies cannot be summed); the number of skipped deals is reported instead.
 * `chartStages` limits the stage breakdown to one pipeline; KPIs cover every deal passed in.
 */
export function computeDashboardMetrics(input: {
  deals: readonly DashboardDeal[];
  stages: readonly DashboardStage[];
  chartStages?: readonly DashboardStage[];
  currency: string;
  now: Date;
  timeZone: string;
}): DashboardMetrics {
  const { now, timeZone, currency } = input;
  const stageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const thisMonth = monthKey(now, timeZone);
  const months = previousMonths(thisMonth, 6);
  const wonByMonth = new Map(months.map((month) => [month, new Decimal(0)]));
  const since90 = now.getTime() - 90 * DAY_MS;

  let openAmount = new Decimal(0);
  let openCount = 0;
  let weighted = new Decimal(0);
  let won = 0;
  let lost = 0;
  let closingAmount = new Decimal(0);
  let closingCount = 0;
  let excluded = 0;
  const stageTotals = new Map<string, { count: number; amount: Decimal; weighted: Decimal }>();

  for (const deal of input.deals) {
    const stage = stageById.get(deal.stageId);
    if (!stage) continue;
    if (deal.currency !== currency) {
      excluded += 1;
      continue;
    }
    const amount = new Decimal(deal.amount);

    if (stage.type === "OPEN") {
      const dealWeighted = amount.mul(stage.probability).div(100);
      openAmount = openAmount.add(amount);
      openCount += 1;
      weighted = weighted.add(dealWeighted);
      const totals = stageTotals.get(stage.id) ?? {
        count: 0,
        amount: new Decimal(0),
        weighted: new Decimal(0),
      };
      totals.count += 1;
      totals.amount = totals.amount.add(amount);
      totals.weighted = totals.weighted.add(dealWeighted);
      stageTotals.set(stage.id, totals);

      // Expected close dates are calendar dates, stored at UTC midnight.
      if (deal.expectedCloseDate && monthKey(deal.expectedCloseDate, "UTC") === thisMonth) {
        closingAmount = closingAmount.add(amount);
        closingCount += 1;
      }
    } else if (deal.closedAt) {
      if (deal.closedAt.getTime() >= since90 && deal.closedAt.getTime() <= now.getTime()) {
        if (stage.type === "WON") won += 1;
        else lost += 1;
      }
      if (stage.type === "WON") {
        const key = monthKey(deal.closedAt, timeZone);
        const bucket = wonByMonth.get(key);
        if (bucket) wonByMonth.set(key, bucket.add(amount));
      }
    }
  }

  const chartStages = [...(input.chartStages ?? input.stages)]
    .filter((stage) => stage.type === "OPEN")
    .sort((a, b) => a.position - b.position);

  return {
    currency,
    openPipeline: { amount: toNumber(openAmount), count: openCount },
    weightedForecast: toNumber(weighted),
    winRate90d: { won, lost, rate: won + lost > 0 ? won / (won + lost) : null },
    closingThisMonth: { amount: toNumber(closingAmount), count: closingCount },
    byStage: chartStages.map((stage) => {
      const totals = stageTotals.get(stage.id);
      return {
        stageId: stage.id,
        name: stage.name,
        count: totals?.count ?? 0,
        amount: totals ? toNumber(totals.amount) : 0,
        weighted: totals ? toNumber(totals.weighted) : 0,
      };
    }),
    wonByMonth: months.map((month) => ({
      month,
      amount: toNumber(wonByMonth.get(month) ?? new Decimal(0)),
    })),
    excludedOtherCurrency: excluded,
  };
}
