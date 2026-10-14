import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

test("members of a duplicate group can be left out of a merge", async ({ page }) => {
  const email = `dupes.${Date.now().toString(36)}@example.com`;
  await registerWorkspace(page, { email, workspaceName: "Dupes Ltd" });
  const { workspaceId } = await workspaceOf(email);
  const ids = await withDb(async (client) => {
    const insert = async (first: string, last: string, phone: string | null, jobTitle: string) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", email, phone, "jobTitle", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, 'info@shared.example', $4, $5, now() - ($6 || ' minutes')::interval, now())
           RETURNING id`,
          [workspaceId, first, last, phone, jobTitle, String(10 - first.length)],
        )
      ).rows[0]!.id;
    return {
      keep: await insert("Jane", "Kept", "0111 000 111", "Buyer"),
      merge: await insert("Jane", "Doe", "+44 20 7946 0000", "CTO"),
      other: await insert("Reception", "Desk", null, "Front desk"),
    };
  });

  await page.goto("/contacts/duplicates");
  const group = page.getByRole("region", { name: "Duplicate group" });
  await expect(group.getByRole("checkbox")).toHaveCount(3);
  await group.getByRole("radio", { name: "Keep Jane Kept" }).check();
  await group.getByRole("checkbox", { name: "Include Reception Desk" }).uncheck();
  await group.getByRole("button", { name: "Merge 1 into selected" }).click();
  await expect(page.getByText("Merged 1 contact")).toBeVisible();

  const remaining = await withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM "Contact" WHERE "workspaceId" = $1 ORDER BY id`,
      [workspaceId],
    );
    return rows.map((row) => row.id).sort();
  });
  expect(remaining).toEqual([ids.keep, ids.other].sort());

  // The values that were not kept are listed on the kept contact.
  await page.goto(`/contacts/${ids.keep}`);
  await expect(page.getByText("Merged from Jane Doe")).toBeVisible();
  await expect(page.getByText(/phone \+44 20 7946 0000, job title CTO/)).toBeVisible();
});
