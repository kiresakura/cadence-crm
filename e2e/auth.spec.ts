import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD } from "./helpers";

test("signing in with an off-site next parameter stays on this site", async ({ page }) => {
  // Never let the browser reach the outside host if the redirect regresses.
  await page.route(
    (url) => url.hostname === "evil.example",
    (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Off-site page</h1>" }),
  );

  await page.goto("/login?next=/\\evil.example/x");
  await page.getByLabel("Email").fill("owner@demo.local");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/^http:\/\/localhost:3101\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Off-site page" })).toHaveCount(0);
});

test("signing in returns to a same-site next path", async ({ page }) => {
  await page.goto("/login?next=/contacts?q=ada");
  await page.getByLabel("Email").fill("owner@demo.local");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\?q=ada$/);
});
