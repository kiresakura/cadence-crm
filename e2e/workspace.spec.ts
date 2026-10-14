import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("an owner creates a second workspace, switches to it and back", async ({ page }) => {
  const name = `Side project ${Date.now().toString(36)}`;
  await signIn(page, "owner@demo.local");

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "New workspace" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create workspace" }).click();

  // The new workspace is empty and fully separate from the demo data.
  await expect(page.getByText(`Here is how ${name} is doing.`)).toBeVisible();
  await expect(page.getByTestId("metric-open-pipeline")).toHaveText("$0");

  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menuitem", { name: /Cadence Demo/ }).click();
  await expect(page.getByText("Here is how Cadence Demo is doing.")).toBeVisible();
  await expect(page.getByTestId("metric-open-pipeline")).not.toHaveText("$0");
});

test("an admin invites a member who can sign in with the temporary password", async ({
  page,
  browser,
}) => {
  const email = `new.hire.${Date.now().toString(36)}@example.com`;
  await signIn(page, "owner@demo.local");
  await page.goto("/settings/members");
  await page.getByLabel("Name").fill("Noor Hollis");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption("VIEWER");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const password = (await page.getByTestId("temporary-password").textContent())?.trim() ?? "";
  expect(password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{4}$/);
  await page.keyboard.press("Escape");
  await expect(page.getByText(email)).toBeVisible();

  const context = await browser.newContext();
  const invited = await context.newPage();
  await invited.goto("/login");
  await invited.getByLabel("Email").fill(email);
  await invited.getByLabel("Password").fill(password);
  await invited.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(invited).toHaveURL(/\/dashboard$/);
  await expect(invited.getByText("You have read-only access to this workspace.")).toBeVisible();
  await context.close();
});
