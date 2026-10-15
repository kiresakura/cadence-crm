import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { withDb } from "./db";
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

test("toasts and an open record picker have no serious or critical axe violations", async ({
  page,
}) => {
  // Toasts appear without their entry animation, so their final colors are checked.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "owner@demo.local");
  const email = `toast.check.${Date.now().toString(36)}@example.com`;

  try {
    await page.goto("/settings/members");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.locator("[data-sonner-toast][data-type='success']")).toBeVisible();
    expect.soft(await seriousViolations(page), "success toast").toEqual([]);
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // Someone who is already a member cannot be invited.
    await page.getByLabel("Email").fill("member@demo.local");
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible();
    expect.soft(await seriousViolations(page), "error toast").toEqual([]);
  } finally {
    await withDb((client) => client.query(`DELETE FROM "Invitation" WHERE email = $1`, [email]));
  }

  // An open picker whose highlighted option shows a detail line.
  await page.goto("/contacts/new");
  const company = page.getByRole("combobox", { name: "Company" });
  await company.click();
  await company.fill("oak");
  const listbox = page.getByRole("listbox", { name: "Company" });
  await expect(listbox.getByRole("option")).toHaveText([/Oakshade Learning/]);
  await expect(company).toHaveAttribute("aria-activedescendant", /option-0$/);
  expect.soft(await seriousViolations(page), "open picker").toEqual([]);
});
