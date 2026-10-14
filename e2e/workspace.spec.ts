import { expect, test, type Browser, type Page } from "@playwright/test";

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

async function createInviteLink(page: Page, email: string, role: string): Promise<string> {
  await page.goto("/settings/members");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption(role);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = page.getByTestId("invite-link");
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/);
  const url = await link.inputValue();
  await page.keyboard.press("Escape");
  // The link is shown once; the pending list only shows who was invited.
  await expect(page.getByText(email)).toBeVisible();
  return url;
}

async function createAccountFromLink(browser: Browser, url: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Password").fill("my-own-long-password");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { context, page };
}

test("an admin invites someone new, who creates an account from the link and joins", async ({
  page,
  browser,
}) => {
  const stamp = Date.now().toString(36);
  await signIn(page, "owner@demo.local");
  const adminLink = await createInviteLink(page, `team.lead.${stamp}@example.com`, "ADMIN");

  // The new admin opens the link in a separate browser and signs up with the invited email.
  const lead = await createAccountFromLink(browser, adminLink, "Team Lead");
  await expect(lead.page.getByText("Here is how Cadence Demo is doing.")).toBeVisible();
  await expect(lead.page.getByText("You have read-only access to this workspace.")).toHaveCount(0);

  // As an admin they can invite a viewer, who lands in the workspace with read-only access.
  const viewerLink = await createInviteLink(lead.page, `new.hire.${stamp}@example.com`, "VIEWER");
  const viewer = await createAccountFromLink(browser, viewerLink, "New Hire");
  await expect(viewer.page.getByText("Here is how Cadence Demo is doing.")).toBeVisible();
  await expect(viewer.page.getByText("You have read-only access to this workspace.")).toBeVisible();

  // Links are single use.
  await viewer.page.goto(viewerLink);
  await expect(
    viewer.page.getByText("This invitation link is invalid or has expired."),
  ).toBeVisible();
  await lead.context.close();
  await viewer.context.close();
});

test("an existing user signs in from the invitation link and accepts", async ({
  page,
  browser,
}) => {
  const email = `existing.${Date.now().toString(36)}@example.com`;
  const context = await browser.newContext();
  const existing = await context.newPage();
  await existing.goto("/register");
  await existing.getByLabel("Your name").fill("Existing Person");
  await existing.getByLabel("Work email").fill(email);
  await existing.getByLabel("Password").fill("my-own-long-password");
  await existing.getByLabel("Workspace name").fill("Existing Co");
  await existing.getByRole("button", { name: "Create workspace" }).click();
  await expect(existing).toHaveURL(/\/dashboard$/);
  await existing.getByRole("button", { name: "Account menu" }).click();
  await existing.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(existing).toHaveURL(/\/login$/);

  await signIn(page, "owner@demo.local");
  const link = await createInviteLink(page, email, "MEMBER");

  await existing.goto(link);
  await expect(
    existing.getByText("You have been invited to Cadence Demo as Member."),
  ).toBeVisible();
  await existing.getByRole("link", { name: "Sign in to accept" }).click();
  await existing.getByLabel("Email").fill(email);
  await existing.getByLabel("Password").fill("my-own-long-password");
  await existing.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(existing.getByText("Join Cadence Demo as Member")).toBeVisible();
  await existing.getByRole("button", { name: "Accept" }).click();
  await expect(existing).toHaveURL(/\/dashboard$/);
  await expect(existing.getByText("Here is how Cadence Demo is doing.")).toBeVisible();
  await existing.getByRole("button", { name: "Switch workspace" }).click();
  await expect(existing.getByRole("menuitem", { name: /Existing Co/ })).toBeVisible();
  await context.close();

  // The invitation is no longer pending and the person is now a member.
  await page.reload();
  // Listed once, as a member, and no longer among the pending invitations.
  await expect(page.getByText(email)).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Role for Existing Person" })).toHaveValue(
    "MEMBER",
  );
});
