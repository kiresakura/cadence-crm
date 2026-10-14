import { expect, test } from "@playwright/test";

import { dragTo, readMetric, signIn } from "./helpers";

test("an owner adds a contact and a deal, moves it on the board and sees the forecast change", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const dealTitle = `Rollout for Larkfield ${suffix}`;

  await signIn(page, "owner@demo.local");
  const forecastBefore = await readMetric(page, "metric-weighted-forecast");
  const pipelineBefore = await readMetric(page, "metric-open-pipeline");

  // Create a contact.
  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "New contact" }).click();
  await page.getByLabel("First name").fill("Nadia");
  await page.getByLabel("Last name").fill(`Larkfield ${suffix}`);
  await page.getByLabel("Email").fill(`nadia.${suffix}@larkfield.example`);
  await page.getByRole("button", { name: "Create contact" }).click();
  await expect(page.getByRole("heading", { name: `Nadia Larkfield ${suffix}` })).toBeVisible();

  // Create a deal for that contact from the contact page.
  await page.getByRole("link", { name: "New deal" }).click();
  await expect(page.getByRole("combobox", { name: "Primary contact" })).toHaveValue(
    `Nadia Larkfield ${suffix}`,
  );
  await page.getByLabel("Title").fill(dealTitle);
  await page.getByLabel("Amount").fill("10000");
  await expect(page.getByLabel("Stage")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page.getByRole("heading", { name: dealTitle })).toBeVisible();

  // Drag the deal from "Lead in" to "Qualified" on the board.
  await page.getByRole("link", { name: "Deals" }).first().click();
  const leadIn = page.locator('[data-stage-name="Lead in"]');
  const qualified = page.locator('[data-stage-name="Qualified"]');
  const card = leadIn.getByRole("article", { name: dealTitle });
  await expect(card).toBeVisible();
  await dragTo(page, card.getByRole("button", { name: `Drag ${dealTitle}` }), qualified);
  await expect(page.getByText(`"${dealTitle}" moved to Qualified`)).toBeVisible();
  await expect(qualified.getByRole("article", { name: dealTitle })).toBeVisible();

  // The move is persisted on the server.
  await page.reload();
  await expect(
    page.locator('[data-stage-name="Qualified"]').getByRole("article", { name: dealTitle }),
  ).toBeVisible();

  // The dashboard reflects the new deal at the Qualified probability (25%).
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect
    .poll(() => readMetric(page, "metric-weighted-forecast"))
    .toBeCloseTo(forecastBefore + 2500, 0);
  expect(await readMetric(page, "metric-open-pipeline")).toBeCloseTo(pipelineBefore + 10000, 0);
});

test("moving a deal to Lost asks for a reason; cancelling keeps it in place", async ({ page }) => {
  await signIn(page, "member@demo.local");
  await page.goto("/deals");
  const proposal = page.locator('[data-stage-name="Proposal"]');
  const firstCard = proposal.getByTestId("deal-card").first();
  const title = (await firstCard.getAttribute("aria-label")) ?? "";

  // The "Move to" menu is the keyboard-accessible alternative to dragging.
  await firstCard.getByRole("button", { name: `Move ${title} to another stage` }).click();
  await page.getByRole("menuitem", { name: "Lost" }).click();
  const dialog = page.getByRole("dialog", { name: "Why was this deal lost?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(dialog.getByText("Give a reason when marking a deal as lost.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(proposal.getByRole("article", { name: title })).toBeVisible();

  // Giving a reason closes the deal.
  await firstCard.getByRole("button", { name: `Move ${title} to another stage` }).click();
  await page.getByRole("menuitem", { name: "Lost" }).click();
  await dialog.getByLabel("Reason").fill("Budget moved to next year");
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(page.getByText(`"${title}" moved to Lost`)).toBeVisible();
  await expect(
    page.locator('[data-stage-name="Lost"]').getByRole("article", { name: title }),
  ).toBeVisible();
});
