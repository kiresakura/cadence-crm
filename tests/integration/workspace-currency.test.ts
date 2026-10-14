import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { getDashboard } from "@/server/services/dashboard";
import { createDeal } from "@/server/services/deals";
import { CURRENCY_CODES, updateWorkspaceCurrency } from "@/server/services/workspaces";

import { createTestWorkspace, stageByName, type TestWorkspace } from "./helpers";

describe("workspace reporting currency", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("offers the common ISO 4217 currencies", () => {
    for (const code of ["TWD", "USD", "EUR", "JPY", "GBP", "CNY", "HKD", "SGD", "AUD", "CAD"]) {
      expect(CURRENCY_CODES).toContain(code);
    }
  });

  it("can be changed by owners and admins only, with an audit entry", async () => {
    await expect(updateWorkspaceCurrency(ws.member, { currency: "TWD" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateWorkspaceCurrency(ws.viewer, { currency: "TWD" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateWorkspaceCurrency(ws.admin, { currency: "XYZ" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateWorkspaceCurrency(ws.admin, { currency: "usd1" })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const updated = await updateWorkspaceCurrency(ws.admin, { currency: "eur" });
    expect(updated.currency).toBe("EUR");
    await updateWorkspaceCurrency(ws.owner, { currency: "USD" });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ws.workspaceId, action: "workspace.currency_changed" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.changes).toEqual({ currency: { from: "USD", to: "EUR" } });
    expect(audit.actorId).toBe(ws.admin.userId);
  });

  it("is used for new deals and for the dashboard", async () => {
    const lead = stageByName(ws, "Lead in").id;
    await createDeal(ws.member, {
      title: "Taipei deal",
      amount: "300000",
      currency: "TWD",
      pipelineId: ws.pipelineId,
      stageId: lead,
    });
    await createDeal(ws.member, {
      title: "US deal",
      amount: "1000",
      currency: "USD",
      pipelineId: ws.pipelineId,
      stageId: lead,
    });

    const before = await getDashboard(ws.viewer);
    expect(before.metrics.currency).toBe("USD");
    expect(before.metrics.openPipeline.amount).toBe(1000);
    expect(before.metrics.excludedOtherCurrency).toBe(1);

    await updateWorkspaceCurrency(ws.owner, { currency: "TWD" });
    const after = await getDashboard(ws.viewer);
    expect(after.metrics.currency).toBe("TWD");
    expect(after.metrics.openPipeline.amount).toBe(300000);
    expect(after.metrics.excludedOtherCurrency).toBe(1);

    // Without a currency, a new deal uses the workspace's.
    const defaulted = await createDeal(ws.member, {
      title: "Defaulted",
      amount: "5",
      pipelineId: ws.pipelineId,
      stageId: lead,
    });
    expect(defaulted.currency).toBe("TWD");
  });
});
