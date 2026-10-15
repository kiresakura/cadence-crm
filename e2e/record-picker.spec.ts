import { expect, test, type Page } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

interface Fixture {
  workspaceId: string;
  alphaId: string;
  betaId: string;
  adaId: string;
  beaId: string;
  dealId: string;
}

/** Two companies and two contacts; the deal and Ada start out linked to Alpha and Ada. */
async function arrangeSmallWorkspace(workspaceId: string, userId: string): Promise<Fixture> {
  return withDb(async (client) => {
    const company = async (name: string) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO "Company" (id, "workspaceId", name, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, now()) RETURNING id`,
          [workspaceId, name],
        )
      ).rows[0]!.id;
    const contact = async (firstName: string, lastName: string, companyId: string) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "companyId", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now()) RETURNING id`,
          [workspaceId, firstName, lastName, companyId],
        )
      ).rows[0]!.id;
    const alphaId = await company("Alpha Old Co");
    const betaId = await company("Beta New Co");
    const adaId = await contact("Ada", "Oldfield", alphaId);
    const beaId = await contact("Bea", "Newman", betaId);
    const stage = await client.query<{ id: string; pipelineId: string }>(
      `SELECT id, "pipelineId" FROM "Stage" WHERE "workspaceId" = $1 ORDER BY position LIMIT 1`,
      [workspaceId],
    );
    const deal = await client.query<{ id: string }>(
      `INSERT INTO "Deal" (id, "workspaceId", title, amount, currency, "pipelineId", "stageId",
                           "companyId", "primaryContactId", "ownerId", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Picker deal', 10, 'USD', $2, $3, $4, $5, $6, now())
       RETURNING id`,
      [workspaceId, stage.rows[0]!.pipelineId, stage.rows[0]!.id, alphaId, adaId, userId],
    );
    return { workspaceId, alphaId, betaId, adaId, beaId, dealId: deal.rows[0]!.id };
  });
}

async function resetLinks(f: Fixture) {
  await withDb(async (client) => {
    await client.query(
      `UPDATE "Deal" SET "companyId" = $2, "primaryContactId" = $3 WHERE id = $1`,
      [f.dealId, f.alphaId, f.adaId],
    );
    await client.query(`UPDATE "Contact" SET "companyId" = $2 WHERE id = $1`, [f.adaId, f.alphaId]);
  });
}

async function readRow(table: "Deal" | "Contact", id: string) {
  return withDb(async (client) => {
    const { rows } = await client.query<{ companyId: string | null; primaryContactId?: string }>(
      table === "Deal"
        ? `SELECT "companyId", "primaryContactId" FROM "Deal" WHERE id = $1`
        : `SELECT "companyId" FROM "Contact" WHERE id = $1`,
      [id],
    );
    return rows[0]!;
  });
}

/** Types into a picker and waits until the server's results for that text are listed. */
async function typeAndWait(page: Page, name: string, text: string) {
  const field = page.getByRole("combobox", { name, exact: true });
  const listbox = page.getByRole("listbox", { name, exact: true });
  await field.click();
  await expect(listbox.getByRole("option").first()).toBeVisible();
  const results = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes(JSON.stringify(text)),
  );
  await field.fill(text);
  await (await results).finished();
  await expect(listbox).not.toHaveAttribute("aria-busy", "true");
  await expect(listbox.getByRole("option").first()).toBeVisible();
  return { field, listbox };
}

async function typeThenEnter(page: Page, name: string, text: string) {
  const { field } = await typeAndWait(page, name, text);
  await field.press("Enter");
  return field;
}

test.describe("record pickers that already have a value", () => {
  let fixture: Fixture;
  const email = `picker.${Date.now().toString(36)}@example.com`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerWorkspace(page, { email, workspaceName: "Picker Desk" });
    await page.close();
    const { workspaceId, userId } = await workspaceOf(email);
    fixture = await arrangeSmallWorkspace(workspaceId, userId);
  });

  test.beforeEach(async ({ page }) => {
    await resetLinks(fixture);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("my-own-long-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("typing another company on a deal and pressing Enter saves that company", async ({
    page,
  }) => {
    await page.goto(`/deals/${fixture.dealId}/edit`);
    await expect(page.getByRole("combobox", { name: "Company" })).toHaveValue("Alpha Old Co");
    const company = await typeThenEnter(page, "Company", "beta");
    await expect(company).toHaveValue("Beta New Co");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${fixture.dealId}$`));
    expect(await readRow("Deal", fixture.dealId)).toEqual({
      companyId: fixture.betaId,
      primaryContactId: fixture.adaId,
    });
  });

  test("typing another contact on a deal and pressing Enter saves that contact", async ({
    page,
  }) => {
    await page.goto(`/deals/${fixture.dealId}/edit`);
    await expect(page.getByRole("combobox", { name: "Primary contact" })).toHaveValue(
      "Ada Oldfield",
    );
    const contact = await typeThenEnter(page, "Primary contact", "newman");
    await expect(contact).toHaveValue("Bea Newman");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${fixture.dealId}$`));
    expect(await readRow("Deal", fixture.dealId)).toEqual({
      companyId: fixture.alphaId,
      primaryContactId: fixture.beaId,
    });
  });

  test("typing another company on a contact and pressing Enter saves that company", async ({
    page,
  }) => {
    await page.goto(`/contacts/${fixture.adaId}/edit`);
    await expect(page.getByRole("combobox", { name: "Company" })).toHaveValue("Alpha Old Co");
    const company = await typeThenEnter(page, "Company", "beta");
    await expect(company).toHaveValue("Beta New Co");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${fixture.adaId}$`));
    expect(await readRow("Contact", fixture.adaId)).toEqual({ companyId: fixture.betaId });
  });

  test("a new deal's pickers can be changed by typing after a first choice", async ({ page }) => {
    await page.goto("/deals/new");
    await page.getByLabel("Title").fill("Second thoughts");
    await page.getByLabel("Amount").fill("250");
    await expect(await typeThenEnter(page, "Company", "alpha")).toHaveValue("Alpha Old Co");
    await expect(await typeThenEnter(page, "Company", "beta")).toHaveValue("Beta New Co");
    await expect(await typeThenEnter(page, "Primary contact", "oldfield")).toHaveValue(
      "Ada Oldfield",
    );
    await expect(await typeThenEnter(page, "Primary contact", "newman")).toHaveValue("Bea Newman");
    await page.getByRole("button", { name: "Create deal" }).click();
    await expect(page.getByRole("link", { name: "Bea Newman" })).toBeVisible();

    const dealId = page.url().split("/").at(-1)!;
    expect(await readRow("Deal", dealId)).toEqual({
      companyId: fixture.betaId,
      primaryContactId: fixture.beaId,
    });
  });

  test("arrow keys and the mouse still choose from the list", async ({ page }) => {
    await page.goto(`/deals/${fixture.dealId}/edit`);

    // Both companies match "co"; the first match is highlighted and ArrowDown moves on.
    const { field: company, listbox } = await typeAndWait(page, "Company", "co");
    await expect(listbox.getByRole("option")).toHaveText(["Alpha Old Co", "Beta New Co"]);
    await company.press("ArrowDown");
    await company.press("Enter");
    await expect(company).toHaveValue("Beta New Co");

    const contacts = await typeAndWait(page, "Primary contact", "newman");
    await contacts.listbox.getByRole("option", { name: /Bea Newman/ }).click();
    await expect(contacts.field).toHaveValue("Bea Newman");

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${fixture.dealId}$`));
    expect(await readRow("Deal", fixture.dealId)).toEqual({
      companyId: fixture.betaId,
      primaryContactId: fixture.beaId,
    });
  });
});
