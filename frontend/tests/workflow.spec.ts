import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

test("backup download, cancel, stale review and atomic restore persist", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download backup", exact: true })
    .click();
  const download = await downloadEvent;
  const file = await readFile((await download.path())!);
  const saved = JSON.parse(file.toString("utf8"));
  expect(saved.app).toBe("auction-helper");
  expect(saved.formatVersion).toBe(1);
  expect(saved.auditEvents.length).toBeGreaterThan(0);
  const invoke = async (action: string, payload: unknown = null) => {
    const response = await page.request.post("/api/request", {
      data: { action, payload },
    });
    const result = await response.json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  const extra = {
    ...saved.lots[0].input,
    id: null,
    title: "Added after backup 🦆",
  };
  await invoke("save_lot", extra);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const choose = () =>
    page.getByLabel("Backup file", { exact: true }).setInputFiles({
      name: "saved-workspace.json",
      mimeType: "application/json",
      buffer: file,
    });
  await choose();
  const dialog = page.getByRole("dialog", { name: "Restore workspace" });
  await expect(dialog).toContainText(`Lots: ${saved.lots.length}`);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await invoke("snapshot")).lots.length).toBe(saved.lots.length + 1);
  await choose();
  await expect(dialog).toBeVisible();
  await invoke("settings", {
    ...saved.settings,
    minProfitCents: saved.settings.minProfitCents + 100,
  });
  await dialog
    .getByRole("button", { name: "Replace workspace", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed since preview",
  );
  expect((await invoke("snapshot")).lots.length).toBe(saved.lots.length + 1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await choose();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("restore-review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Replace workspace", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("restore-review-phone.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Replace workspace", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".backup-panel").getByRole("status")).toContainText(
    "Previous workspace backup saved at",
  );
  await expect(page.getByLabel("Minimum net profit ($)")).toHaveValue(
    String(saved.settings.minProfitCents / 100),
  );
  let restored = await invoke("snapshot");
  expect(restored.lots.length).toBe(saved.lots.length);
  expect(restored.inventory).toEqual(saved.inventory);
  expect(restored.settings).toEqual(saved.settings);
  await page.reload();
  restored = await invoke("snapshot");
  expect(restored.lots.length).toBe(saved.lots.length);
  expect(restored.inventory).toEqual(saved.inventory);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("not JSON"),
  });
  await expect(page.locator(".backup-panel").getByRole("alert")).toContainText(
    "Invalid backup JSON",
  );
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_000_001, 32),
  });
  await expect(page.locator(".backup-panel").getByRole("alert")).toContainText(
    "1 MB limit",
  );
  expect((await invoke("snapshot")).inventory).toEqual(saved.inventory);
});

test("inventory inspection notes cancel, persist and refuse conflicting edits without changing the ledger", async ({
  page,
}, info) => {
  const { emptyLot } = await import("../src/sample");
  async function backend(action: string, payload: unknown = null) {
    const response = await page.request.post("/api/request", {
      data: { action, payload },
    });
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.error).toBeUndefined();
    return result.data;
  }
  await page.goto("/");
  const initial = {
    ...emptyLot(),
    title: "Inspection notes browser fixture",
    url: "https://example.com/notes",
    notes: "Original source note",
    estimateCents: 20000,
  };
  const saved = await backend("save_lot", initial);
  const lotId = saved.lots.find(
    (lot: { input: { title: string } }) => lot.input.title === initial.title,
  ).input.id;
  const purchased = await backend("purchase", {
    id: lotId,
    acquisitionCents: 5000,
  });
  const item = purchased.inventory.find(
    (item: { lotId: string }) => item.lotId === lotId,
  );
  const ledger = (value: typeof purchased) => ({
    inventory: value.inventory,
    available: value.availableCents,
    invested: value.investedCents,
    realized: value.realizedProfitCents,
  });
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const open = () =>
    page
      .getByRole("button", {
        name: `Edit notes for ${item.title}`,
        exact: true,
      })
      .click();
  await open();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Inspection & lot notes")).toHaveValue(
    "Original source note",
  );
  await dialog.getByLabel("Inspection & lot notes").fill("Cancelled draft");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await backend("snapshot")).lots.find(
      (lot: { input: { id: string } }) => lot.input.id === lotId,
    ).input.notes,
  ).toBe("Original source note");
  await open();
  await dialog
    .getByLabel("Inspection & lot notes")
    .fill("Battery tested 🦆\nPickup planned.");
  const latest = (await backend("snapshot")).lots.find(
    (lot: { input: { id: string } }) => lot.input.id === lotId,
  ).input;
  await backend("save_lot", {
    ...latest,
    title: "Concurrent source title kept",
  });
  await dialog.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await backend("snapshot");
  expect(
    after.lots.find((lot: { input: { id: string } }) => lot.input.id === lotId)
      .input.title,
  ).toBe("Concurrent source title kept");
  expect(ledger(after)).toEqual(ledger(purchased));
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await open();
  await expect(dialog.getByLabel("Inspection & lot notes")).toHaveValue(
    "Battery tested 🦆\nPickup planned.",
  );
  await dialog
    .getByLabel("Inspection & lot notes")
    .fill("My unsaved inspection draft");
  const current = (await backend("snapshot")).lots.find(
    (lot: { input: { id: string } }) => lot.input.id === lotId,
  ).input;
  await backend("save_lot", {
    ...current,
    notes: "Another session's newer note",
  });
  await dialog.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed since you opened",
  );
  await expect(dialog.getByLabel("Inspection & lot notes")).toHaveValue(
    "My unsaved inspection draft",
  );
  await expect(
    dialog.getByRole("button", { name: "Save notes", exact: true }),
  ).toBeFocused();
  expect(ledger(await backend("snapshot"))).toEqual(ledger(purchased));
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await open();
  await expect(dialog.getByLabel("Inspection & lot notes")).toHaveValue(
    "Another session's newer note",
  );
  await page.screenshot({
    path: info.outputPath("inventory-notes-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Save notes", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("inventory-notes-phone.png") });
});
