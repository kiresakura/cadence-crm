import { AlarmClock, CalendarCheck2, CircleDollarSign, Scale, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, Section } from "@/components/page";
import { Timeline } from "@/components/records/timeline";
import { formatMoney, formatPercent } from "@/lib/format";
import { otherCurrenciesNote } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/next/request";
import { getDashboard } from "@/server/services/dashboard";

import { PipelineByStageChart, WonByMonthChart } from "./charts";

export const metadata: Metadata = { title: "Dashboard" };

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  testId,
  href,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Trophy;
  testId: string;
  href?: string;
  tone?: "warning";
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <Icon className={cn("size-4", tone === "warning" && "text-destructive")} />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </>
  );
  const className = "rounded-xl border bg-card p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(className, "hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { ctx, user, workspace } = await requirePageContext();
  const params = await searchParams;
  const { metrics, overdueTasks, recentActivities, pipelines, chartPipeline } = await getDashboard(
    ctx,
    {
      timeZone: user.timezone,
      pipelineId: typeof params.pipeline === "string" ? params.pipeline : undefined,
    },
  );
  const currency = metrics.currency;
  const { won, lost, rate } = metrics.winRate90d;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={`Here is how ${workspace.name} is doing.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Open pipeline"
          value={formatMoney(metrics.openPipeline.amount, currency)}
          detail={`${metrics.openPipeline.count} open deals`}
          icon={CircleDollarSign}
          testId="metric-open-pipeline"
          href="/deals"
        />
        <Metric
          label="Weighted forecast"
          value={formatMoney(metrics.weightedForecast, currency)}
          detail="Deal value × stage probability"
          icon={Scale}
          testId="metric-weighted-forecast"
        />
        <Metric
          label="Win rate (90 days)"
          value={formatPercent(rate)}
          detail={`${won} won · ${lost} lost`}
          icon={Trophy}
          testId="metric-win-rate"
        />
        <Metric
          label="Closing this month"
          value={formatMoney(metrics.closingThisMonth.amount, currency)}
          detail={`${metrics.closingThisMonth.count} deals expected to close`}
          icon={CalendarCheck2}
          testId="metric-closing-this-month"
        />
        <Metric
          label="Overdue tasks"
          value={String(overdueTasks)}
          detail="Across the whole team"
          icon={AlarmClock}
          testId="metric-overdue-tasks"
          href="/tasks?view=overdue"
          tone={overdueTasks > 0 ? "warning" : undefined}
        />
      </div>
      {metrics.excludedOtherCurrency > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Amounts are in {currency}. {otherCurrenciesNote(metrics.excludedOtherCurrency)}.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section
          title={`Open pipeline by stage${chartPipeline ? ` · ${chartPipeline.name}` : ""}`}
          action={
            pipelines.length > 1 ? (
              <div className="flex gap-1">
                {pipelines.map((pipeline) => (
                  <Link
                    key={pipeline.id}
                    href={`/dashboard?pipeline=${pipeline.id}`}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted",
                      pipeline.id === chartPipeline?.id && "bg-muted font-medium text-foreground",
                    )}
                  >
                    {pipeline.name}
                  </Link>
                ))}
              </div>
            ) : null
          }
        >
          <PipelineByStageChart data={metrics.byStage} currency={currency} />
        </Section>
        <Section title="Won revenue, last 6 months">
          <WonByMonthChart data={metrics.wonByMonth} currency={currency} />
        </Section>
      </div>

      <Section title="Recent activity" className="mt-6">
        <Timeline items={recentActivities} timeZone={user.timezone} canWrite={false} />
      </Section>
    </>
  );
}
