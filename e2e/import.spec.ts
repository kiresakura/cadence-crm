import { expect, test } from "@playwright/test";

import { registerWorkspace } from "./helpers";

function csvFile(name: string, text: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") };
}

test.describe("contact import", () => {
  test.beforeEach(async ({ page }) => {
    await registerWorkspace(page, {
      email: `importer.${Date.now().toString(36)}@example.com`,
      workspaceName: "Import Desk",
    });
    await page.goto("/contacts/import");
  });

  test("a Chinese spreadsheet is mapped, split family name first and imported", async ({
    page,
  }) => {
    const text = [
      "姓名,電子郵件,公司",
      "王小明,ming@example.com,台北商行",
      "",
      "Cher,cher@example.com,",
    ].join("\n");
    await page.getByLabel("CSV file").setInputFiles(csvFile("聯絡人.csv", text));
    await expect(page.getByRole("heading", { name: "3. Preview" })).toBeVisible();
    await expect(page.getByText("1 ready")).toBeVisible();
    await expect(page.getByText(/Could not split the full name "Cher"/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "4", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Import 1 contacts" }).click();
    await expect(page.getByText("Imported 1 contacts")).toBeVisible();
    await page.goto("/contacts");
    await expect(page.getByRole("link", { name: "王小明" })).toBeVisible();
  });

  test("a 1.3 MB file gets a clear row-limit message instead of an error page", async ({
    page,
  }) => {
    const rows = Array.from(
      { length: 21_000 },
      (_, i) =>
        `Person ${i},Number ${i},person.${i}@example.com,+1 555 ${String(i).padStart(5, "0")}`,
    );
    const text = `First name,Last name,Email,Phone\n${rows.join("\n")}`;
    expect(Buffer.byteLength(text)).toBeGreaterThan(1_000_000);
    expect(Buffer.byteLength(text)).toBeLessThan(2 * 1024 * 1024);

    await page.getByLabel("CSV file").setInputFiles(csvFile("big.csv", text));
    await expect(page.getByTestId("import-error")).toHaveText(
      "Import at most 5000 rows at a time.",
    );
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "1. Choose a CSV file" })).toBeVisible();
  });

  test("a file over 2 MB is refused next to the picker and the preview stays", async ({ page }) => {
    await page
      .getByLabel("CSV file")
      .setInputFiles(csvFile("small.csv", "First name,Last name\nAda,Lovelace\n"));
    await expect(page.getByText("1 ready")).toBeVisible();

    const huge = `First name,Last name,Notes\n${"Ada,Lovelace,".concat("x".repeat(200)).concat("\n").repeat(11_000)}`;
    expect(Buffer.byteLength(huge)).toBeGreaterThan(2 * 1024 * 1024);
    await page.getByLabel("CSV file").setInputFiles(csvFile("huge.csv", huge));
    await expect(page.getByTestId("import-error")).toHaveText(
      '"huge.csv" is larger than 2 MB. Split it into smaller files.',
    );
    await expect(page.getByText("1 ready")).toBeVisible();
    await expect(page.getByText("small.csv")).toBeVisible();
  });
});
