import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ConflictError, ValidationError } from "@/server/errors";
import {
  closeDeal,
  createDeal,
  deleteDeal,
  dealToInput,
  getBoard,
  getDeal,
  listDeals,
  moveDeal,
  parseDealFilters,
  updateDeal,
} from "@/server/services/deals";
import {
  addStage,
  createPipeline,
  deletePipeline,
  deleteStage,
  listPipelines,
  renamePipeline,
  reorderStages,
  shiftStage,
  updateStage,
} from "@/server/services/pipelines";

import { createTestWorkspace, stageByName, type TestWorkspace } from "./helpers";

describe("deal stage rules", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  async function newDeal(stage = "Lead in") {
    return createDeal(ws.member, {
      title: `Deal in ${stage}`,
      amount: "1200.50",
      currency: "usd",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, stage).id,
      expectedCloseDate: "2026-11-30",
    });
  }

  it("creates open deals with exact decimal amounts", async () => {
    const deal = await newDeal();
    expect(deal.amount.toFixed(2)).toBe("1200.50");
    expect(deal.currency).toBe("USD");
    expect(deal.closedAt).toBeNull();
    expect(dealToInput(await getDeal(ws.viewer, deal.id))).toMatchObject({
      amount: "1200.50",
      expectedCloseDate: "2026-11-30",
    });
  });

  it("moves between stages and records the change", async () => {
    const deal = await newDeal();
    const moved = await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Proposal").id });
    expect(moved.stage.name).toBe("Proposal");
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: deal.id, action: "deal.stage_changed" },
    });
    expect(audit.changes).toEqual({ stage: { from: "Lead in", to: "Proposal" } });
  });

  it("sets closedAt when won and clears it when reopened", async () => {
    const deal = await newDeal("Negotiation");
    const won = await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Won").id });
    expect(won.closedAt).toBeInstanceOf(Date);
    const reopened = await moveDeal(ws.member, deal.id, {
      stageId: stageByName(ws, "Proposal").id,
    });
    expect(reopened.closedAt).toBeNull();
  });

  it("requires a reason to mark a deal lost", async () => {
    const deal = await newDeal();
    await expect(
      moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Lost").id }),
    ).rejects.toThrow(ValidationError);
    const lost = await moveDeal(ws.member, deal.id, {
      stageId: stageByName(ws, "Lost").id,
      lostReason: "Chose a competitor",
    });
    expect(lost).toMatchObject({ lostReason: "Chose a competitor" });
    expect(lost.closedAt).toBeInstanceOf(Date);
    const won = await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Won").id });
    expect(won.lostReason).toBeNull();
  });

  it("marks deals won or lost through closeDeal", async () => {
    const deal = await newDeal();
    expect((await closeDeal(ws.member, deal.id, "WON")).stage.type).toBe("WON");
    await expect(closeDeal(ws.member, deal.id, "LOST")).rejects.toThrow(ValidationError);
    expect((await closeDeal(ws.member, deal.id, "LOST", "Timing")).stage.type).toBe("LOST");
  });

  it("only moves deals within their own pipeline", async () => {
    const other = await createPipeline(ws.admin, { name: "Partnerships" });
    const otherStage = await db.stage.findFirstOrThrow({ where: { pipelineId: other.id } });
    const deal = await newDeal();
    await expect(moveDeal(ws.member, deal.id, { stageId: otherStage.id })).rejects.toThrow(
      /own pipeline/,
    );
    await expect(moveDeal(ws.member, deal.id, { stageId: "missing" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("applies the same rules when editing a deal", async () => {
    const deal = await newDeal();
    const input = dealToInput(await getDeal(ws.member, deal.id));
    await expect(
      updateDeal(ws.member, deal.id, { ...input, stageId: stageByName(ws, "Lost").id }),
    ).rejects.toThrow(ValidationError);
    const updated = await updateDeal(ws.member, deal.id, {
      ...input,
      amount: "2000",
      stageId: stageByName(ws, "Lost").id,
      lostReason: "No budget",
    });
    expect(updated.amount.toFixed(2)).toBe("2000.00");
    expect(updated.closedAt).toBeInstanceOf(Date);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: deal.id, action: "deal.updated" },
    });
    expect(audit.changes).toMatchObject({ amount: { from: "1200.50", to: "2000.00" } });
  });

  it("lists, filters and shows deals on the board", async () => {
    const open = await listDeals(ws.viewer, parseDealFilters({ status: "open", sort: "-amount" }));
    expect(open.items.every((deal) => deal.stage.type === "OPEN")).toBe(true);
    const won = await listDeals(ws.viewer, parseDealFilters({ status: "won" }));
    expect(won.items.every((deal) => deal.stage.type === "WON")).toBe(true);
    const board = await getBoard(ws.viewer);
    expect(board.stages.map((stage) => stage.name)).toEqual([
      "Lead in",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Won",
      "Lost",
    ]);
    expect(board.deals.length).toBeGreaterThan(0);
  });

  it("deletes deals", async () => {
    const deal = await newDeal();
    await deleteDeal(ws.member, deal.id);
    expect(await db.deal.findUnique({ where: { id: deal.id } })).toBeNull();
  });
});

describe("pipeline settings", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
  });

  it("adds open stages before closed ones and reorders stages", async () => {
    const stage = await addStage(ws.admin, ws.pipelineId, {
      name: "Demo",
      probability: "60",
      type: "OPEN",
    });
    let [pipeline] = await listPipelines(ws.viewer);
    expect(pipeline!.stages.map((s) => s.name)).toEqual([
      "Lead in",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Demo",
      "Won",
      "Lost",
    ]);
    await shiftStage(ws.admin, stage.id, "up");
    await shiftStage(ws.admin, pipeline!.stages[0]!.id, "up");
    [pipeline] = await listPipelines(ws.viewer);
    expect(pipeline!.stages.map((s) => s.name).slice(3, 5)).toEqual(["Demo", "Negotiation"]);

    const reversed = [...pipeline!.stages].reverse().map((s) => s.id);
    await reorderStages(ws.admin, ws.pipelineId, reversed);
    [pipeline] = await listPipelines(ws.viewer);
    expect(pipeline!.stages[0]!.name).toBe("Lost");
    await expect(reorderStages(ws.admin, ws.pipelineId, reversed.slice(1))).rejects.toThrow(
      ValidationError,
    );
  });

  it("protects stages that hold deals and keeps every stage type", async () => {
    const proposal = stageByName(ws, "Proposal");
    await createDeal(ws.member, {
      title: "Blocking deal",
      amount: "10",
      pipelineId: ws.pipelineId,
      stageId: proposal.id,
    });
    await expect(deleteStage(ws.admin, proposal.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateStage(ws.admin, proposal.id, { name: "Proposal", probability: 50, type: "WON" }),
    ).rejects.toThrow(ValidationError);
    await expect(deleteStage(ws.admin, stageByName(ws, "Won").id)).rejects.toThrow(/WON/);
    const renamed = await updateStage(ws.admin, proposal.id, {
      name: "Proposal sent",
      probability: 55,
      type: "OPEN",
    });
    expect(renamed).toMatchObject({ name: "Proposal sent", probability: 55 });
    await deleteStage(ws.admin, stageByName(ws, "Qualified").id);
    await expect(
      updateStage(ws.admin, stageByName(ws, "Lead in").id, {
        name: "x",
        probability: 101,
        type: "OPEN",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("renames and deletes pipelines with safeguards", async () => {
    await expect(deletePipeline(ws.admin, ws.pipelineId)).rejects.toBeInstanceOf(ConflictError);
    const extra = await createPipeline(ws.admin, { name: "Renewals" });
    await renamePipeline(ws.admin, extra.id, { name: "Renewals 2027" });
    await expect(deletePipeline(ws.admin, ws.pipelineId)).rejects.toThrow(/deals/);
    await deletePipeline(ws.admin, extra.id);
    expect((await listPipelines(ws.viewer)).map((p) => p.name)).toEqual(["Sales"]);
  });
});
