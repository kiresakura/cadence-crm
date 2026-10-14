import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

test("an owner switches the workspace to TWD and totals follow it", async ({ page }) => {
  const email = `twd.${Date.now().toString(36)}@example.com`;
  await registerWorkspace(page, { email, workspaceName: "Taipei Sales" });
  const { workspaceId, userId } = await workspaceOf(email);

  await page.goto("/settings/workspace");
  await page.getByLabel("Reporting currency").selectOption("TWD");
  await page.getByRole("button", { name: "Save currency" }).click();
  await expect(page.getByText("Reporting currency saved")).toBeVisible();
  await expect(page.getByText("TWD — New Taiwan Dollar").first()).toBeVisible();

  // New deals start in the workspace currency.
  await page.goto("/deals/new");
  await expect(page.getByLabel("Currency")).toHaveValue("TWD");

  // Three open deals in the first stage: one in TWD, two in other currencies.
  await withDb(async (client) => {
    const { rows } = await client.query<{ id: string; pipelineId: string }>(
      `SELECT id, "pipelineId" FROM "Stage" WHERE "workspaceId" = $1 ORDER BY position LIMIT 1`,
      [workspaceId],
    );
    for (const [title, amount, currency] of [
      ["Taipei rollout", 300000, "TWD"],
      ["US pilot", 1000, "USD"],
      ["Osaka pilot", 5000, "JPY"],
    ] as const) {
      await client.query(
        `INSERT INTO "Deal" (id, "workspaceId", title, amount, currency, "pipelineId", "stageId", "ownerId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, now())`,
        [workspaceId, title, amount, currency, rows[0]!.pipelineId, rows[0]!.id, userId],
      );
    }
  });

  await page.goto("/deals");
  const column = page.locator('[data-stage-name="Lead in"]');
  await expect(column.getByTestId("column-total")).toHaveText(/^NT\$300,000/);
  await expect(column.getByTestId("column-other-currencies")).toHaveText(
    "+2 deals in other currencies not included",
  );

  await page.goto("/dashboard");
  await expect(page.getByTestId("metric-open-pipeline")).toHaveText("NT$300,000");
  await expect(
    page.getByText("Amounts are in TWD. +2 deals in other currencies not included."),
  ).toBeVisible();
});
