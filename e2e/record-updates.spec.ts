import { expect, test, type Page } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

async function addField(page: Page, label: string, type = "TEXT") {
  await page.goto("/settings/fields");
  await page.getByLabel("Applies to").selectOption("CONTACT");
  await page.locator("#field-label").fill(label);
  await page.getByLabel("Type").selectOption(type);
  await page.getByRole("button", { name: "Add field" }).click();
  // The form clears itself once the field is saved; then the new field is listed.
  await expect(page.locator("#field-label")).toHaveValue("");
  await expect(
    page
      .getByRole("textbox", { name: "Label", exact: true })
      .and(page.locator(`[value="${label}"]`)),
  ).toHaveCount(1);
}

test.describe("record updates after settings change", () => {
  const email = `settings.${Date.now().toString(36)}@example.com`;
  let workspaceId: string;
  let ownerId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerWorkspace(page, { email, workspaceName: "Settings Co", name: "Sam Settings" });
    await page.close();
    ({ workspaceId, userId: ownerId } = await workspaceOf(email));
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("my-own-long-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("a select value whose option was removed survives edits in the form and the API", async ({
    page,
  }) => {
    const contactId = await withDb(async (client) => {
      await client.query(
        `INSERT INTO "CustomFieldDefinition" (id, "workspaceId", "entityType", key, label, type, options, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'CONTACT', 'segment', 'Segment', 'SELECT', ARRAY['Alpha 2','Beta'], now())`,
        [workspaceId],
      );
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "customFields", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Selma', 'Legacy', '{"segment":"Alpha"}', now())
         RETURNING id`,
        [workspaceId],
      );
      return rows[0]!.id;
    });
    const stored = async () =>
      withDb(async (client) => {
        const { rows } = await client.query<{ customFields: unknown; jobTitle: string | null }>(
          `SELECT "customFields", "jobTitle" FROM "Contact" WHERE id = $1`,
          [contactId],
        );
        return rows[0]!;
      });

    await page.goto(`/contacts/${contactId}/edit`);
    const segment = page.getByLabel("Segment");
    await expect(segment).toHaveValue("Alpha");
    await expect(segment.locator("option:checked")).toHaveText("Alpha (no longer an option)");
    await page.getByLabel("Job title").fill("Buyer");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
    expect(await stored()).toEqual({ customFields: { segment: "Alpha" }, jobTitle: "Buyer" });

    const response = await page.request.patch(`/api/contacts/${contactId}`, {
      data: { jobTitle: "Head buyer" },
    });
    expect(response.status()).toBe(200);
    expect(await stored()).toEqual({ customFields: { segment: "Alpha" }, jobTitle: "Head buyer" });
  });

  test("fields labelled Constructor or in Chinese can be added and contacts still created", async ({
    page,
  }) => {
    await addField(page, "Constructor");
    await addField(page, "預算");
    await addField(page, "產業");
    const keys = await withDb(async (client) => {
      const { rows } = await client.query<{ key: string }>(
        `SELECT key FROM "CustomFieldDefinition" WHERE "workspaceId" = $1 AND label = ANY($2) ORDER BY "createdAt"`,
        [workspaceId, ["Constructor", "預算", "產業"]],
      );
      return rows.map((row) => row.key);
    });
    expect(keys).toEqual(["field_constructor", "field", "field_2"]);

    const response = await page.request.post("/api/contacts", {
      data: { firstName: "Bob", lastName: "Builder" },
    });
    expect(response.status()).toBe(201);

    await page.goto("/contacts/new");
    await page.getByLabel("First name").fill("Wendy");
    await page.getByLabel("Last name").fill("Builder");
    await page.getByLabel("Constructor").fill("Scoop");
    await page.getByLabel("預算").fill("1000");
    await page.getByRole("button", { name: "Create contact" }).click();
    await expect(page.getByRole("heading", { name: "Wendy Builder" })).toBeVisible();
  });

  test("removing a member hands their records to the chosen person", async ({ page }) => {
    const { contactId, colleagueId } = await withDb(async (client) => {
      const colleague = await client.query<{ id: string }>(
        `INSERT INTO "User" (id, email, name, "passwordHash", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Casey Colleague', 'not-a-hash', now()) RETURNING id`,
        [`colleague.${Date.now().toString(36)}@example.com`],
      );
      const leaver = await client.query<{ id: string }>(
        `INSERT INTO "User" (id, email, name, "passwordHash", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Lee Leaver', 'not-a-hash', now()) RETURNING id`,
        [`leaver.${Date.now().toString(36)}@example.com`],
      );
      for (const userId of [colleague.rows[0]!.id, leaver.rows[0]!.id]) {
        await client.query(
          `INSERT INTO "Membership" (id, "workspaceId", "userId", role, "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'MEMBER', now())`,
          [workspaceId, userId],
        );
      }
      const contact = await client.query<{ id: string }>(
        `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "ownerId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Owned', 'ByLeaver', $2, now()) RETURNING id`,
        [workspaceId, leaver.rows[0]!.id],
      );
      return { contactId: contact.rows[0]!.id, colleagueId: colleague.rows[0]!.id };
    });

    await page.goto("/settings/members");
    await page.getByRole("button", { name: "Remove Lee Leaver" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove Lee Leaver?" });
    await expect(dialog.getByLabel("Hand over their work to")).toHaveValue(ownerId);
    await dialog.getByLabel("Hand over their work to").selectOption({ label: "Casey Colleague" });
    await dialog.getByRole("button", { name: "Remove member" }).click();
    await expect(page.getByText("Member removed")).toBeVisible();
    await expect(page.getByText("Lee Leaver")).toHaveCount(0);

    const owner = await withDb(async (client) => {
      const { rows } = await client.query<{ ownerId: string }>(
        `SELECT "ownerId" FROM "Contact" WHERE id = $1`,
        [contactId],
      );
      return rows[0]!.ownerId;
    });
    expect(owner).toBe(colleagueId);
  });

  test("a record owned by someone who left keeps that owner when edited", async ({ page }) => {
    const contactId = await withDb(async (client) => {
      const former = await client.query<{ id: string }>(
        `INSERT INTO "User" (id, email, name, "passwordHash", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Fran Former', 'not-a-hash', now()) RETURNING id`,
        [`former.${Date.now().toString(36)}@example.com`],
      );
      const contact = await client.query<{ id: string }>(
        `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "ownerId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Kept', 'Owner', $2, now()) RETURNING id`,
        [workspaceId, former.rows[0]!.id],
      );
      return contact.rows[0]!.id;
    });
    const ownerOf = () =>
      withDb(async (client) => {
        const { rows } = await client.query<{ ownerId: string | null }>(
          `SELECT "ownerId" FROM "Contact" WHERE id = $1`,
          [contactId],
        );
        return rows[0]!.ownerId;
      });
    const before = await ownerOf();

    await page.goto(`/contacts/${contactId}/edit`);
    await expect(page.getByLabel("Owner").locator("option:checked")).toHaveText(
      "Fran Former (no longer a member)",
    );
    await page.getByLabel("Job title").fill("Buyer");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
    expect(await ownerOf()).toBe(before);
  });

  test("a legacy field keyed like an object built-in shows no stray value", async ({ page }) => {
    const contactId = await withDb(async (client) => {
      await client.query(
        `INSERT INTO "CustomFieldDefinition" (id, "workspaceId", "entityType", key, label, type, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'CONTACT', 'constructor', 'Builder', 'TEXT', now())`,
        [workspaceId],
      );
      const contact = await client.query<{ id: string }>(
        `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'No', 'Value', now()) RETURNING id`,
        [workspaceId],
      );
      return contact.rows[0]!.id;
    });
    await page.goto(`/contacts/${contactId}`);
    await expect(page.getByText("No Value").first()).toBeVisible();
    await expect(page.getByText(/function Object|native code/)).toHaveCount(0);
  });
});
