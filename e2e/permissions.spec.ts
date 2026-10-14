import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("a viewer sees no editing controls and the API refuses their writes", async ({ page }) => {
  await signIn(page, "viewer@demo.local");
  await expect(page.getByText("You have read-only access to this workspace.")).toBeVisible();

  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New contact" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Import" })).toHaveCount(0);

  const firstContact = page.getByRole("row").nth(1).getByRole("link").first();
  await firstContact.click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log activity" })).toHaveCount(0);
  const contactId = page.url().split("/").pop() ?? "";

  await page.getByRole("link", { name: "Deals" }).first().click();
  await expect(page.getByRole("link", { name: "New deal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Drag / })).toHaveCount(0);
  const dealHref = await page
    .getByTestId("deal-card")
    .first()
    .getByRole("link")
    .getAttribute("href");
  const dealId = dealHref?.split("/").pop() ?? "";

  // Reading through the API works...
  const list = await page.request.get("/api/contacts?pageSize=5");
  expect(list.status()).toBe(200);
  expect((await list.json()).items.length).toBeGreaterThan(0);

  // ...but every write is rejected by the server, not just hidden in the UI.
  const create = await page.request.post("/api/contacts", {
    data: { firstName: "Sneaky", lastName: "Viewer" },
  });
  expect(create.status()).toBe(403);
  expect((await create.json()).error.code).toBe("FORBIDDEN");

  const update = await page.request.patch(`/api/contacts/${contactId}`, {
    data: { firstName: "Changed" },
  });
  expect(update.status()).toBe(403);

  const remove = await page.request.delete(`/api/contacts/${contactId}`);
  expect(remove.status()).toBe(403);

  const move = await page.request.post(`/api/deals/${dealId}/stage`, {
    data: { stageId: "anything" },
  });
  expect(move.status()).toBe(403);

  // Exports are reads, so viewers may download them.
  const csv = await page.request.get("/api/export/contacts?lifecycle=CUSTOMER");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("First name,Last name,Email");

  // Admin-only pages are not available either.
  await page.goto("/settings/members");
  await expect(page.getByText("Settings are limited to admins")).toBeVisible();
});

test("the API requires a session", async ({ request }) => {
  const response = await request.get("/api/contacts");
  expect(response.status()).toBe(401);
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ status: "ok", database: "ok" });
});

test("a new user registers a workspace and starts empty", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Robin Fairweather");
  await page.getByLabel("Work email").fill(`robin.${suffix}@example.com`);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByLabel("Workspace name").fill(`Fairweather ${suffix}`);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("metric-open-pipeline")).toHaveText("$0");
  await page.getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByText("No contacts yet")).toBeVisible();
});
