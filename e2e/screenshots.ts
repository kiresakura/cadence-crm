import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Regenerates the README screenshots from the demo data: npm run screenshots
const dir = "docs/screenshots";

const SAMPLE_CSV = [
  "First name,Last name,Email,Phone,Company,Lifecycle stage,Tags",
  "Avery,Stone,avery.stone@larkspur.example,+1 (415) 555-0190,Larkspur & Vane,prospect,VIP",
  "Jordan,Ilves,jordan.ilves@moonquill.example,,Moonquill Studio,lead,",
  "Sasha,Brennick,sasha.brennick@amberleaf.example,,Amberleaf Analytics,customer,Champion",
  ",Nameless,missing.name@example.com,,,,",
  "Robin,Quell,robin.quell@example.com,,,unknown-stage,",
].join("\n");

/**
 * Captures once the sidebar marks the section the page belongs to. Animations are settled
 * first, so a highlight still fading over from the previous page is never captured, and the
 * pointer is moved out of the way so no hover state or chart tooltip shows.
 */
async function capture(page: Page, name: string, section: string) {
  await expect(
    page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]'),
  ).toHaveText(section);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
}

test("capture README screenshots", async ({ page }) => {
  await signIn(page, "owner@demo.local");
  await expect(page.getByTestId("metric-open-pipeline")).toBeVisible();
  await page.waitForTimeout(1500);
  await capture(page, "dashboard", "Dashboard");

  await page.goto("/deals");
  await expect(page.getByTestId("board-column").first()).toBeVisible();
  await capture(page, "deals-board", "Deals");

  await page.goto("/contacts");
  await expect(page.getByRole("table")).toBeVisible();
  await capture(page, "contacts-list", "Contacts");

  await page.goto("/deals?view=list&status=open&sort=-amount");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/deals\/[^/]+$/);
  await capture(page, "deal-detail", "Deals");

  // The deal's primary contact has activities, deals and tasks to show.
  await page.locator("dd a[href^='/contacts/']").first().click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await capture(page, "contact-detail", "Contacts");

  await page.goto("/contacts/import");
  await page.getByLabel("CSV file").setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(SAMPLE_CSV),
  });
  await expect(page.getByText("3. Preview")).toBeVisible();
  await capture(page, "import", "Contacts");

  await page.goto("/settings/pipelines");
  await expect(page.getByRole("region", { name: "Sales pipeline" })).toBeVisible();
  await capture(page, "settings-pipelines", "Settings");

  await page.goto("/contacts/duplicates");
  await expect(page.getByRole("region", { name: "Duplicate group" }).first()).toBeVisible();
  await capture(page, "duplicates", "Contacts");
});
