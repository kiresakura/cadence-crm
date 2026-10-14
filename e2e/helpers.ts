import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "cadence-demo";

export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Signs up through the public form, which creates a fresh workspace owned by the new user. */
export async function registerWorkspace(
  page: Page,
  {
    email,
    workspaceName,
    name = "Test Owner",
  }: { email: string; workspaceName: string; name?: string },
) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("my-own-long-password");
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** "$12,500" -> 12500 */
export function parseMoney(text: string | null): number {
  return Number((text ?? "").replace(/[^0-9.-]/g, ""));
}

export async function readMetric(page: Page, testId: string): Promise<number> {
  return parseMoney(await page.getByTestId(testId).textContent());
}

/** Drags with real pointer moves so dnd-kit's activation distance is crossed. */
export async function dragTo(
  page: Page,
  source: ReturnType<Page["locator"]>,
  target: ReturnType<Page["locator"]>,
) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source or target is not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 20 });
  await page.mouse.up();
}
