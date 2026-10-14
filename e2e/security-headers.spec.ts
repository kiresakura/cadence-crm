import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

/** Collects Content Security Policy violations reported by the browser. */
function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

async function expectPolicy(page: Page, path: string, violations: string[], text?: RegExp) {
  const response = await page.goto(path);
  expect(response, path).not.toBeNull();
  const policy = response!.headers()["content-security-policy"] ?? "";
  expect(policy, path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy, path).toContain("frame-ancestors 'none'");
  if (text) await expect(page.getByText(text).first()).toBeVisible();
  // Let hydration and late scripts run before counting violations.
  await page.waitForLoadState("networkidle");
  expect(violations, `CSP violations on ${path}`).toEqual([]);
}

test("public pages send a nonce-based CSP and run without violations", async ({ page }) => {
  const violations = watchViolations(page);
  await expectPolicy(page, "/", violations);
  await expectPolicy(page, "/login", violations, /Sign in/);
  await expectPolicy(page, "/register", violations, /Create your workspace/);
  await expectPolicy(page, "/invite/not-a-real-token", violations, /Invitation unavailable/);
  await expectPolicy(page, "/this-page-does-not-exist", violations, /Page not found/);

  // Forms still work under the policy (the page hydrated and the action ran).
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.local");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password.").first()).toBeVisible();
  expect(violations).toEqual([]);
});

test("signed-in pages send a nonce-based CSP and run without violations", async ({ page }) => {
  const violations = watchViolations(page);
  await signIn(page, "owner@demo.local");
  await expectPolicy(page, "/dashboard", violations, /Here is how/);
  await expectPolicy(page, "/contacts", violations, /Contacts/);
  await expectPolicy(page, "/deals", violations, /Deals/);
  await expectPolicy(page, "/contacts/import", violations, /Import contacts/);
  await expectPolicy(page, "/settings/workspace", violations, /Settings/);
  await expectPolicy(page, "/settings/members", violations, /Settings/);
});

test("the nonce changes on every response", async ({ request }) => {
  const nonceOf = async () =>
    /'nonce-([^']+)'/.exec(
      (await request.get("/login")).headers()["content-security-policy"] ?? "",
    )?.[1];
  const first = await nonceOf();
  expect(first).toBeTruthy();
  expect(await nonceOf()).not.toBe(first);
});
