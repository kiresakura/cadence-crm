import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace, signIn } from "./helpers";

test("moving a card from its menu keeps focus on the card and outlines the current choice", async ({
  page,
}) => {
  const email = `board.keys.${Date.now().toString(36)}@example.com`;
  await registerWorkspace(page, { email, workspaceName: "Board Keys" });
  const { workspaceId, userId } = await workspaceOf(email);
  await withDb(async (client) => {
    const stage = await client.query<{ id: string; pipelineId: string }>(
      `SELECT id, "pipelineId" FROM "Stage" WHERE "workspaceId" = $1 ORDER BY position LIMIT 1`,
      [workspaceId],
    );
    await client.query(
      `INSERT INTO "Deal" (id, "workspaceId", title, amount, currency, "pipelineId", "stageId",
                           "ownerId", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Keyboard card', 100, 'USD', $2, $3, $4, now())`,
      [workspaceId, stage.rows[0]!.pipelineId, stage.rows[0]!.id, userId],
    );
  });

  await page.goto("/deals");
  const moveButton = (stage: string) =>
    page
      .getByRole("region", { name: `${stage} stage` })
      .getByRole("button", { name: "Move Keyboard card to another stage" });
  await moveButton("Lead in").focus();
  await page.keyboard.press("Enter");

  // The highlighted stage is outlined, not only shaded a near-white gray.
  const choice = page.getByRole("menuitem", { name: "Qualified" });
  await expect(choice).toBeFocused();
  await expect(choice).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Enter");

  await expect(page.getByText('"Keyboard card" moved to Qualified')).toBeVisible();
  await expect(moveButton("Qualified")).toBeFocused();
  // Tabbing carries on from the card instead of starting over at the top of the page.
  await page.keyboard.press("Shift+Tab");
  await expect(
    page
      .getByRole("region", { name: "Qualified stage" })
      .getByRole("link", { name: "Keyboard card" }),
  ).toBeFocused();
});

test("the highlighted option of a record picker is outlined, not only shaded", async ({ page }) => {
  await signIn(page, "owner@demo.local");
  await page.goto("/contacts/new");
  const company = page.getByRole("combobox", { name: "Company" });
  await company.click();
  await company.fill("oak");
  const option = page.getByRole("listbox", { name: "Company" }).getByRole("option");
  await expect(option).toHaveText([/Oakshade Learning/]);
  await expect(company).toHaveAttribute("aria-activedescendant", /option-0$/);
  await expect(option).not.toHaveCSS("box-shadow", "none");
});
