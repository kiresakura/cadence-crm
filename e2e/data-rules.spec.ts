import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

test.describe("data safeguards", () => {
  const email = `rules.${Date.now().toString(36)}@example.com`;
  let workspaceId: string;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerWorkspace(page, { email, workspaceName: "Rules Inc" });
    await page.close();
    ({ workspaceId, userId } = await workspaceOf(email));
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("my-own-long-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("an amount with a comma as decimal mark is refused, not read as 1250", async ({ page }) => {
    await page.goto("/deals/new");
    await page.getByLabel("Title").fill("Comma deal");
    await page.getByLabel("Amount").fill("12,50");
    await page.getByRole("button", { name: "Create deal" }).click();
    await expect(page.getByText(/Commas and spaces can only separate thousands/)).toBeVisible();
    await expect(page).toHaveURL(/\/deals\/new$/);

    await page.getByLabel("Amount").fill("1,250.50");
    await page.getByRole("button", { name: "Create deal" }).click();
    await expect(page.getByRole("heading", { name: "Comma deal" })).toBeVisible();
    await expect(page.getByText(/\$1,250\.5/).first()).toBeVisible();
  });

  test("deleting a tag asks first and says how many records lose it", async ({ page }) => {
    await withDb(async (client) => {
      const tag = await client.query<{ id: string }>(
        `INSERT INTO "Tag" (id, "workspaceId", name, color, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Partner', 'teal', now()) RETURNING id`,
        [workspaceId],
      );
      for (const name of ["Ann", "Bob"]) {
        const contact = await client.query<{ id: string }>(
          `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'Tagged', now()) RETURNING id`,
          [workspaceId, name],
        );
        await client.query(`INSERT INTO "ContactTag" ("contactId", "tagId") VALUES ($1, $2)`, [
          contact.rows[0]!.id,
          tag.rows[0]!.id,
        ]);
      }
    });

    await page.goto("/settings/tags");
    await page.getByRole("button", { name: "Delete tag Partner" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("It will be removed from 2 contacts");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Tag name", exact: true })).toHaveValue(
      "Partner",
    );

    await page.getByRole("button", { name: "Delete tag Partner" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Tag deleted")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Tag name", exact: true })).toHaveCount(0);
  });

  test("deleting a contact removes activities and tasks only it had", async ({ page }) => {
    const ids = await withDb(async (client) => {
      const company = await client.query<{ id: string }>(
        `INSERT INTO "Company" (id, "workspaceId", name, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Shared Co', now()) RETURNING id`,
        [workspaceId],
      );
      const contact = await client.query<{ id: string }>(
        `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "companyId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Gone', 'Soon', $2, now()) RETURNING id`,
        [workspaceId, company.rows[0]!.id],
      );
      const insertActivity = (links: [string | null, string | null]) =>
        client.query<{ id: string }>(
          `INSERT INTO "Activity" (id, "workspaceId", type, subject, "contactId", "companyId", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, 'NOTE', 'Note', $2, $3, now()) RETURNING id`,
          [workspaceId, ...links],
        );
      const own = await insertActivity([contact.rows[0]!.id, null]);
      const shared = await insertActivity([contact.rows[0]!.id, company.rows[0]!.id]);
      const task = await client.query<{ id: string }>(
        `INSERT INTO "Task" (id, "workspaceId", title, "contactId", "assigneeId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, 'Call back', $2, $3, now()) RETURNING id`,
        [workspaceId, contact.rows[0]!.id, userId],
      );
      return {
        contact: contact.rows[0]!.id,
        own: own.rows[0]!.id,
        shared: shared.rows[0]!.id,
        task: task.rows[0]!.id,
      };
    });

    await page.goto(`/contacts/${ids.contact}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      "This also deletes 1 activity and 1 task that only belong to this contact.",
    );
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/contacts$/);

    const left = await withDb(async (client) => {
      const activities = await client.query<{ id: string }>(
        `SELECT id FROM "Activity" WHERE id = ANY($1)`,
        [[ids.own, ids.shared]],
      );
      const tasks = await client.query(`SELECT id FROM "Task" WHERE id = $1`, [ids.task]);
      return { activities: activities.rows.map((row) => row.id), tasks: tasks.rowCount };
    });
    expect(left).toEqual({ activities: [ids.shared], tasks: 0 });
  });
});
