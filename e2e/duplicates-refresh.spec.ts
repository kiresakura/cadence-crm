import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

test("a group that changes after a merge offers its current members", async ({ page }) => {
  const email = `regroup.${Date.now().toString(36)}@example.com`;
  await registerWorkspace(page, { email, workspaceName: "Regroup" });
  const { workspaceId } = await workspaceOf(email);
  // A and B share a phone; B and C share an email.
  const ids = await withDb(async (client) => {
    const insert = async (first: string, mail: string | null, phone: string | null) =>
      (
        await client.query<{ id: string }>(
          `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", email, phone, "phoneNormalized", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'Regroup', $3, $4, $5, now(), now())
           RETURNING id`,
          [workspaceId, first, mail, phone, phone ? phone.replace(/\D/g, "") : null],
        )
      ).rows[0]!.id;
    return {
      a: await insert("Ann", null, "+1 555 0101"),
      b: await insert("Bea", "team@regroup.example", "+1 555 0101"),
      c: await insert("Cal", "team@regroup.example", null),
    };
  });

  await page.goto("/contacts/duplicates");
  const groups = page.getByRole("region", { name: "Duplicate group" });
  const phoneGroup = groups.filter({ hasText: "same phone" });
  await phoneGroup.getByRole("radio", { name: "Keep Ann Regroup" }).check();
  await phoneGroup.getByRole("button", { name: "Merge 1 into selected" }).click();
  await expect(page.getByText("Merged 1 contact")).toBeVisible();

  // Ann took Bea's email, so the email group is now Ann and Cal: both ticked, one of them kept.
  const emailGroup = groups.filter({ hasText: "same email" });
  await expect(emailGroup.getByRole("checkbox", { name: "Include Ann Regroup" })).toBeChecked();
  await expect(emailGroup.getByRole("checkbox", { name: "Include Cal Regroup" })).toBeChecked();
  await expect(emailGroup.getByRole("radio", { checked: true })).toHaveCount(1);
  await emailGroup.getByRole("radio", { name: "Keep Ann Regroup" }).check();
  await emailGroup.getByRole("button", { name: "Merge 1 into selected" }).click();
  await expect(page.getByText("No duplicates found")).toBeVisible();
  await expect(page.getByText("Every contact must belong to this duplicate group")).toHaveCount(0);

  const left = await withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM "Contact" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    return rows.map((row) => row.id);
  });
  expect(left).toEqual([ids.a]);
});
