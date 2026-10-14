import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
    }));
}

test("public pages have no serious or critical axe violations", async ({ page }) => {
  for (const path of ["/", "/login", "/register", "/invite/not-a-real-token"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect.soft(await seriousViolations(page), path).toEqual([]);
  }
});

test("main app pages have no serious or critical axe violations", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "owner@demo.local");

  // Detail pages of records from the demo data.
  await page.goto("/contacts");
  const contactHref = await page.getByRole("table").getByRole("link").first().getAttribute("href");
  await page.goto("/deals?view=list");
  const dealHref = await page.getByRole("table").getByRole("link").first().getAttribute("href");
  await page.goto("/companies");
  const companyHref = await page.getByRole("table").getByRole("link").first().getAttribute("href");

  for (const path of [
    "/dashboard",
    "/contacts",
    "/contacts/new",
    contactHref!,
    "/contacts/duplicates",
    "/contacts/import",
    "/companies",
    companyHref!,
    "/deals",
    dealHref!,
    "/tasks",
    "/settings/workspace",
    "/settings/pipelines",
    "/settings/tags",
    "/settings/fields",
    "/settings/members",
    "/audit-log",
    "/account",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect.soft(await seriousViolations(page), path).toEqual([]);
  }
});
