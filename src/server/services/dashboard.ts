import { db } from "../db";
import { computeDashboardMetrics } from "../domain/dashboard";
import { assertCan, type Ctx } from "../permissions";
import { countOverdueTasks } from "./tasks";
import { listRecentActivities } from "./activities";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboard(
  ctx: Ctx,
  options: { now?: Date; timeZone?: string; pipelineId?: string } = {},
) {
  assertCan(ctx, "records:read");
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "UTC";
  // Closed deals older than ~6 months do not affect any widget.
  const closedSince = new Date(now.getTime() - 200 * DAY_MS);

  const [workspace, pipelines, stages, deals, overdueTasks, recentActivities] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { currency: true },
    }),
    db.pipeline.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    db.stage.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: {
        id: true,
        name: true,
        type: true,
        probability: true,
        position: true,
        pipelineId: true,
      },
    }),
    db.deal.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [{ stage: { type: "OPEN" } }, { closedAt: { gte: closedSince } }],
      },
      select: {
        amount: true,
        currency: true,
        stageId: true,
        closedAt: true,
        expectedCloseDate: true,
      },
    }),
    countOverdueTasks(ctx, now),
    listRecentActivities(ctx, 8),
  ]);

  const chartPipeline =
    pipelines.find((pipeline) => pipeline.id === options.pipelineId) ?? pipelines[0] ?? null;
  const metrics = computeDashboardMetrics({
    deals,
    stages,
    chartStages: stages.filter((stage) => stage.pipelineId === chartPipeline?.id),
    currency: workspace.currency,
    now,
    timeZone,
  });

  return { metrics, overdueTasks, recentActivities, pipelines, chartPipeline };
}
