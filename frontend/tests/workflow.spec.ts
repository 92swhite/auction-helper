import { test, expect } from "@playwright/test";

test("manual auction → evidence → watch → persisted purchase → sale", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next opportunity starts here" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add auction", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Auction title").fill("Test Sony headphones");
  await dialog.getByLabel("Source URL").fill("https://example.com/test-lot");
  await dialog.getByLabel("Current hammer bid ($)").fill("40");
  await dialog.getByLabel("Manual resale estimate ($)").fill("180");
  await dialog
    .getByRole("button", { name: "Costs & assumptions", exact: true })
    .click();
  await dialog.getByLabel("Buyer’s premium (%)").fill("13");
  await dialog.getByLabel("Sales tax (%)").fill("9");
  await dialog.getByLabel("Marketplace fee (%)").fill("13");
  await dialog.getByLabel("Outbound shipping / insurance ($)").fill("12");
  await dialog
    .getByRole("button", { name: "Comparable evidence", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Add comparable" }).click();
  await dialog.getByLabel("Comparable title").fill("Same model, tested");
  await dialog.getByLabel("Evidence URL").fill("https://example.com/sold/1");
  await dialog.getByLabel("Sale / asking price ($)").fill("200");
  await dialog.getByRole("button", { name: "Save & analyze" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".analysis-pair")).toContainText("$200.00");
  await expect(page.locator(".evidence")).toContainText("1 included sales");
  await page
    .getByRole("button", { name: "Watch Test Sony headphones", exact: true })
    .click();
  await page.getByRole("button", { name: /^Watchlist/ }).click();
  await expect(page.locator(".lot-row")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Unwatch Test Sony headphones",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record purchase", exact: true })
    .click();
  await page.getByLabel("Actual total acquisition cost ($)").fill("60");
  await page.getByRole("button", { name: "Confirm record" }).click();
  await expect(page.locator(".metric").first()).toContainText("$940.00");
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByRole("button", { name: "Record sale" }).click();
  await page.getByLabel("Gross proceeds received ($)").fill("200");
  await page.getByLabel("Actual selling expenses ($)").fill("40");
  await page.getByRole("button", { name: "Confirm record" }).click();
  await expect(page.locator("tbody")).toContainText("Sold");
  await expect(page.locator(".metric").first()).toContainText("$1,100.00");
  await expect(page.locator(".metric").nth(2)).toContainText("$100.00");
  await page.reload();
  await expect(page.locator(".metric").first()).toContainText("$1,100.00");
});

test("settings persist and unsafe source links are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Minimum net profit ($)").fill("75");
  await page.getByRole("button", { name: "Save criteria" }).click();
  await expect(page.getByRole("status")).toContainText("Buying criteria saved");
  await page.reload();
  await expect(page.locator(".guardrails")).toContainText("$75.00");
  await page.getByRole("button", { name: "Add auction", exact: true }).click();
  await page.getByLabel("Auction title").fill("Unsafe link rejected");
  await page.getByLabel("Source URL").fill("file:///etc/passwd");
  await page.getByRole("button", { name: "Save & analyze" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Only http or https",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
