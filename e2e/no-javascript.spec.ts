import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// Before the page hydrates (slow network, early Enter), a form without a method would be
// submitted as GET and put the password in the address bar, history and server logs.
test.describe("forms submitted before JavaScript loads", () => {
  test.use({ javaScriptEnabled: false });

  test("the sign-in form never sends the password in the URL", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@demo.local");
    await page.getByLabel("Password").fill("not-in-the-url-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("password");
    expect(page.url()).not.toContain("not-in-the-url-123");
  });

  test("the sign-up form never sends the password in the URL", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("No Script");
    await page.getByLabel("Work email").fill("no.script@example.com");
    await page.getByLabel("Password").fill("not-in-the-url-123");
    await page.getByLabel("Workspace name").fill("No Script Co");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("password");
    expect(page.url()).not.toContain("not-in-the-url-123");
  });

  test("email fields are limited to 254 characters", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toHaveAttribute("maxlength", "254");
    await page.goto("/register");
    await expect(page.getByLabel("Work email")).toHaveAttribute("maxlength", "254");
  });
});

test("the change-password and invitation forms never send passwords in the URL", async ({
  browser,
}) => {
  // Sign in and create an invitation with JavaScript, then reuse the session without it.
  const withScript = await browser.newContext();
  const page = await withScript.newPage();
  await signIn(page, "owner@demo.local");
  await page.goto("/settings/members");
  await page.getByLabel("Email").fill(`no.script.${Date.now().toString(36)}@example.com`);
  await page.getByRole("button", { name: "Create invite link" }).click();
  const inviteUrl = await page.getByTestId("invite-link").inputValue();
  const storageState = await withScript.storageState();
  await withScript.close();

  // Signed-in pages stream behind a loading state that needs inline script, so "before
  // JavaScript loads" is simulated by blocking the app bundles: the page shows, never hydrates.
  const signedIn = await browser.newContext({ storageState });
  const account = await signedIn.newPage();
  await account.route("**/_next/static/**", (route) => route.abort());
  await account.goto("/account");
  await account.getByLabel("Current password").fill("not-in-the-url-123");
  await account.getByLabel("New password").fill("also-not-in-the-url-456");
  await account.getByRole("button", { name: "Change password" }).click();
  await account.waitForLoadState("load");
  expect(account.url()).not.toMatch(/password|not-in-the-url|also-not-in-the-url/);
  await signedIn.close();

  const visitor = await browser.newContext({ javaScriptEnabled: false });
  const invite = await visitor.newPage();
  await invite.goto(inviteUrl);
  await invite.getByLabel("Your name").fill("No Script");
  await invite.getByLabel("Password").fill("not-in-the-url-123");
  await invite.getByRole("button", { name: "Create account and join" }).click();
  await invite.waitForLoadState("load");
  expect(invite.url()).not.toMatch(/password|not-in-the-url/);
  await visitor.close();
});

test("record forms never put their values in the URL before hydration", async ({ browser }) => {
  const withScript = await browser.newContext();
  const page = await withScript.newPage();
  await signIn(page, "owner@demo.local");
  const storageState = await withScript.storageState();
  await withScript.close();

  const context = await browser.newContext({ storageState });
  const blocked = await context.newPage();
  await blocked.route("**/_next/static/**", (route) => route.abort());
  await blocked.goto("/contacts/new");
  await blocked.getByLabel("First name").fill("Hydration");
  await blocked.getByLabel("Last name").fill("Pending");
  await blocked.getByRole("button", { name: "Create contact" }).click();
  await blocked.waitForLoadState("load");
  expect(blocked.url()).not.toContain("firstName=");
  await context.close();
});
