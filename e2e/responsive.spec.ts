import { expect, test, type Page } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace, signIn } from "./helpers";

/** Elements wider than the viewport, to explain a failure. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .slice(0, 3)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`.slice(0, 120));
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: width, wide };
  });
}

async function expectNoHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const result = await overflow(page);
  expect
    .soft(result.scrollWidth, `${path} at ${result.innerWidth}px: ${result.wide.join(" | ")}`)
    .toBeLessThanOrEqual(result.innerWidth);
}

for (const width of [375, 768]) {
  test(`main pages fit a ${width}px wide screen`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "owner@demo.local");
    await page.goto("/contacts");
    const contact = await page.getByRole("table").getByRole("link").first().getAttribute("href");
    await page.goto("/deals?view=list");
    const deal = await page.getByRole("table").getByRole("link").first().getAttribute("href");
    for (const path of [
      "/dashboard",
      "/contacts",
      contact!,
      "/companies",
      "/deals",
      deal!,
      "/tasks",
      "/settings/workspace",
      "/settings/members",
      "/account",
    ]) {
      await expectNoHorizontalScroll(page, path);
    }
  });
}

test("a dashboard with many pipelines still fits a phone screen", async ({ page }) => {
  const email = `pipes.${Date.now().toString(36)}@example.com`;
  await page.setViewportSize({ width: 375, height: 900 });
  await registerWorkspace(page, { email, workspaceName: "Many Pipes" });
  const { workspaceId } = await workspaceOf(email);
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Pipeline" (id, "workspaceId", name, position, "updatedAt")
       SELECT gen_random_uuid()::text, $1, 'Regional pipeline ' || g, g, now()
         FROM generate_series(1, 26) g`,
      [workspaceId],
    );
  });
  await expectNoHorizontalScroll(page, "/dashboard");
});

test("the largest amounts a deal can hold still fit the dashboard", async ({ page }) => {
  const email = `big.amounts.${Date.now().toString(36)}@example.com`;
  await registerWorkspace(page, { email, workspaceName: "Big Amounts" });
  const { workspaceId, userId } = await workspaceOf(email);
  await withDb(async (client) => {
    const stage = await client.query<{ id: string; pipelineId: string }>(
      `SELECT id, "pipelineId" FROM "Stage" WHERE "workspaceId" = $1 ORDER BY position LIMIT 1`,
      [workspaceId],
    );
    // Two deals at the Decimal(14,2) maximum, closing today: every amount on the dashboard
    // runs to 13 digits.
    await client.query(
      `INSERT INTO "Deal" (id, "workspaceId", title, amount, currency, "pipelineId", "stageId",
                           "ownerId", "expectedCloseDate", "updatedAt")
       SELECT gen_random_uuid()::text, $1, 'Largest deal ' || g, 999999999999.99, 'USD', $2, $3,
              $4, current_date, now()
         FROM generate_series(1, 2) g`,
      [workspaceId, stage.rows[0]!.pipelineId, stage.rows[0]!.id, userId],
    );
  });
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalScroll(page, "/dashboard");
  }
  await expect(page.getByTestId("metric-open-pipeline")).toHaveText("$1,999,999,999,999.98");
});

test("a page number past the end shows the last page instead of an empty workspace", async ({
  page,
}) => {
  await signIn(page, "owner@demo.local");
  await page.goto("/contacts?page=999");
  // The redirect to the last page arrives while the page streams, so wait for the URL to change.
  await page.waitForURL(
    (url) => url.pathname === "/contacts" && Number(url.searchParams.get("page")) < 999,
  );
  await expect(page.getByText("No contacts yet")).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("link").first()).toBeVisible();
});
