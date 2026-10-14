import { expect, test } from "@playwright/test";

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

test("capture README screenshots", async ({ page }) => {
  await signIn(page, "owner@demo.local");
  await expect(page.getByTestId("metric-open-pipeline")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/dashboard.png` });

  await page.goto("/deals");
  await expect(page.getByTestId("board-column").first()).toBeVisible();
  await page.screenshot({ path: `${dir}/deals-board.png` });

  await page.goto("/contacts");
  await expect(page.getByRole("table")).toBeVisible();
  await page.screenshot({ path: `${dir}/contacts-list.png` });

  await page.goto("/deals?view=list&status=open&sort=-amount");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/deals\/[^/]+$/);
  await page.screenshot({ path: `${dir}/deal-detail.png` });

  // The deal's primary contact has activities, deals and tasks to show.
  await page.locator("dd a[href^='/contacts/']").first().click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await page.screenshot({ path: `${dir}/contact-detail.png` });

  await page.goto("/contacts/import");
  await page.getByLabel("CSV file").setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(SAMPLE_CSV),
  });
  await expect(page.getByText("3. Preview")).toBeVisible();
  await page.screenshot({ path: `${dir}/import.png` });

  await page.goto("/settings/pipelines");
  await expect(page.getByRole("region", { name: "Sales pipeline" })).toBeVisible();
  await page.screenshot({ path: `${dir}/settings-pipelines.png` });

  await page.goto("/contacts/duplicates");
  await expect(page.getByRole("region", { name: "Duplicate group" }).first()).toBeVisible();
  await page.screenshot({ path: `${dir}/duplicates.png` });
});
