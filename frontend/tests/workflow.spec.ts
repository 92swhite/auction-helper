import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyLot } from "../src/sample";

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
  await expect(dialog.getByLabel("Sold (verified by me)")).not.toBeChecked();
  await dialog.getByLabel("Comparable title").fill("Same model, tested");
  await dialog.getByLabel("Evidence URL").fill("https://example.com/sold/1");
  await dialog.getByLabel("Sale / asking price ($)").fill("200");
  await dialog.getByRole("button", { name: "Save & analyze" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".analysis-pair")).toContainText("$180.00");
  await expect(page.locator(".evidence")).toContainText("0 included sales");
  await page.getByRole("button", { name: "Edit selected auction" }).click();
  await dialog
    .getByRole("button", { name: "Comparable evidence", exact: true })
    .click();
  await expect(dialog.getByLabel("Sold (verified by me)")).not.toBeChecked();
  await dialog.getByLabel("Sold (verified by me)").check();
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
  expect(saved.formatVersion).toBe(2);
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

test("source review stays offline, separates sold evidence and preserves a custom source", async ({
  page,
}, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:1420/"))
      externalRequests.push(request.url());
  });
  const invoke = async (action: string, payload: unknown = null) => {
    const response = await page.request.post("/api/request", {
      data: { action, payload },
    });
    const result = await response.json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  await invoke("save_lot", {
    ...emptyLot(),
    title: "Custom source fixture",
    source: "Community tool auction 🦆",
    url: "https://example.com/custom-fixture",
  });
  const before = await invoke("backup");
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const registry = page.getByRole("region", { name: "Source capabilities" });
  await expect(registry).toContainText("Automatic discovery");
  await expect(registry.locator("details")).toHaveCount(8);
  const ebay = registry
    .locator("details")
    .filter({ hasText: "eBay comparable evidence" });
  const summary = ebay.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(ebay).toHaveAttribute("open", "");
  await expect(ebay).toContainText("limited release");
  await expect(ebay).toContainText(
    "Choose Sold only for a verified completed sale",
  );
  await expect(ebay).toContainText(
    "Browse results must not be treated as completed sales",
  );
  await expect(ebay.locator("time")).toHaveAttribute("datetime", "2026-10-28");
  await expect(ebay).toContainText(
    "does not verify this app's production access",
  );
  await page.screenshot({
    path: testInfo.outputPath("source-registry-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("source-registry-phone.png"),
    fullPage: true,
  });
  await page.keyboard.press("Space");
  await expect(ebay).not.toHaveAttribute("open");
  for (const name of ["Dickensheet", "PublicSurplus", "GovDeals", "HiBid"]) {
    const source = registry
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: name }) });
    await source.locator("summary").click();
    await expect(source).toContainText(
      /unverified|not been verified|not been reviewed/,
    );
    await source.locator("summary").click();
  }
  expect(await invoke("backup")).toEqual(before);
  expect(externalRequests).toEqual([]);

  // Simulate an OS/browser launch error without fetching a provider page.
  await page.evaluate(() => {
    window.open = () => {
      throw new Error("Fixture launch failure");
    };
  });
  await summary.click();
  await ebay
    .getByRole("button", { name: "eBay Browse API", exact: true })
    .click();
  await expect(registry.getByRole("alert")).toContainText(
    "could not be opened",
  );
  const opened: string[] = [];
  await page.exposeFunction("captureReference", (url: string) =>
    opened.push(url),
  );
  await page.evaluate(() => {
    window.open = (url) => {
      void (
        window as unknown as { captureReference: (url: string) => void }
      ).captureReference(String(url));
      return null;
    };
  });
  await ebay
    .getByRole("button", { name: "eBay Browse API", exact: true })
    .click();
  await expect
    .poll(() => opened)
    .toEqual([
      "https://developer.ebay.com/api-docs/buy/static/api-browse.html",
    ]);
  await expect(registry.getByRole("alert")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(await invoke("backup")).toEqual(before);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Opportunities", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Custom source fixture",
      exact: true,
      level: 3,
    })
    .click();
  await page
    .getByRole("button", { name: "Edit selected auction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Source", exact: true }),
  ).toHaveValue("Community tool auction 🦆");
  await expect(
    dialog
      .getByRole("combobox", { name: "Source", exact: true })
      .locator("option"),
  ).toHaveText([
    "Manual",
    "Dickensheet",
    "PublicSurplus",
    "GovDeals",
    "HiBid",
    "Other",
    "Community tool auction 🦆",
  ]);
  await dialog.getByRole("button", { name: "Save & analyze" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const after = await invoke("backup");
  const lot = after.lots.find(
    (item: { input: { title: string } }) =>
      item.input.title === "Custom source fixture",
  );
  expect(lot.input.source).toBe("Community tool auction 🦆");
  expect(after.inventory).toEqual(before.inventory);
  expect(after.settings).toEqual(before.settings);
});

test("read-only evidence review exposes all observations without changing valuation", async ({
  page,
}, testInfo) => {
  const invoke = async (action: string, payload: unknown = null) => {
    const response = await page.request.post("/api/request", {
      data: { action, payload },
    });
    const result = await response.json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  const observation = {
    title: "Included sale fixture",
    url: "https://example.com/confirmed-sale",
    soldOn: "2001-01-01",
    priceCents: 25000,
    shippingCents: 1000,
    condition: "Tested working",
    sold: true,
    included: true,
  };
  await invoke("save_lot", {
    ...emptyLot(),
    title: "Evidence review fixture",
    url: "https://example.com/review-fixture",
    condition: "Untested, parts unknown",
    estimateCents: 100000,
    comparables: [
      observation,
      {
        ...observation,
        title: "Excluded sale fixture",
        priceCents: 400000,
        included: false,
      },
      {
        ...observation,
        title: "Asking fixture",
        priceCents: 9000000,
        sold: false,
      },
    ],
  });
  const before = await invoke("backup");
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:1420/"))
      externalRequests.push(request.url());
  });
  await page.goto("/");
  await page
    .getByRole("heading", {
      name: "Evidence review fixture",
      level: 3,
      exact: true,
    })
    .click();
  await expect(page.locator(".analysis-pair")).toContainText("$260.00");
  await expect(page.locator(".evidence")).toContainText("1 included sales");
  const review = page.locator(".comparable-evidence");
  await review.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(review).toHaveAttribute("open", "");
  await expect(review).toContainText("Untested, parts unknown");
  await expect(review).toContainText("Tested working");
  await expect(review).toContainText("No automatic matching or age cutoff");
  await expect(review.locator("li")).toHaveCount(3);
  await expect(review.locator("li").nth(0)).toContainText(
    "Sold · used in estimate",
  );
  await expect(review.locator("li").nth(0)).toContainText("$250.00");
  await expect(review.locator("li").nth(0)).toContainText("$10.00");
  await expect(review.locator("li").nth(0).locator("time")).toHaveAttribute(
    "datetime",
    "2001-01-01",
  );
  await expect(review.locator("li").nth(1)).toContainText(
    "Sold · excluded from estimate",
  );
  await expect(review.locator("li").nth(2)).toContainText(
    "Asking · context only",
  );
  await page.screenshot({
    path: testInfo.outputPath("evidence-review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("evidence-review-phone.png"),
    fullPage: true,
  });
  expect(externalRequests).toEqual([]);
  expect(await invoke("backup")).toEqual(before);
  await page.evaluate(() => {
    window.open = () => {
      throw new Error("Fixture browser failure");
    };
  });
  await review
    .getByRole("button", {
      name: "Open evidence for comparable 1",
      exact: true,
    })
    .click();
  await expect(review.getByRole("alert")).toContainText("could not be opened");
  expect(await invoke("backup")).toEqual(before);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("heading", {
      name: "Custom source fixture",
      level: 3,
      exact: true,
    })
    .click();
  await expect(review).not.toHaveAttribute("open");
  await review.locator("summary").click();
  await expect(review).toContainText("No comparable observations saved");
  await expect(review.getByRole("alert")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(await invoke("backup")).toEqual(before);
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

test("inventory stages save, cancel, correct backward and retain readable history", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const invoke = async (action: string, payload: unknown = null) => {
    const response = await page.request.post("/api/request", {
      data: { action, payload },
    });
    const result = await response.json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  const title = "Lifecycle progress fixture 🦆";
  const saved = await invoke("save_lot", {
    ...emptyLot(),
    title,
    url: "https://example.com/lifecycle",
  });
  const lot = saved.lots.find(
    (entry: { input: { title: string } }) => entry.input.title === title,
  );
  const purchased = await invoke("purchase", {
    id: lot.input.id,
    acquisitionCents: 1000,
  });
  const item = purchased.inventory.find(
    (entry: { lotId: string }) => entry.lotId === lot.input.id,
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("Unreviewed");
  const open = () =>
    row
      .getByRole("button", { name: `Review stage for ${title}`, exact: true })
      .click();
  const dialog = page.getByRole("dialog", { name: "Inventory stage" });
  await open();
  await dialog.getByLabel("Operational stage").selectOption("testing");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await invoke("snapshot")).lifecycle.find(
      (state: { inventoryId: string }) => state.inventoryId === item.id,
    ).stage,
  ).toBe("unreviewed");
  for (const stage of [
    "needs_pickup",
    "testing",
    "ready_to_list",
    "listed",
    "testing",
  ]) {
    await open();
    await dialog.getByLabel("Operational stage").selectOption(stage);
    await dialog
      .getByRole("button", { name: "Save stage", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(row).toContainText("Testing");
  await open();
  await expect(
    dialog.getByRole("region", { name: "Stage history" }).getByRole("listitem"),
  ).toHaveCount(5);
  await expect(dialog).toContainText("Listed → Testing");
  await page.screenshot({
    path: testInfo.outputPath("lifecycle-history-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("lifecycle-history-phone.png"),
    fullPage: true,
  });
  const current = await invoke("snapshot");
  expect(current.inventory).toEqual(purchased.inventory);
  for (const key of ["availableCents", "investedCents", "realizedProfitCents"])
    expect(current[key]).toBe(purchased[key]);
  const backup = await invoke("backup");
  const preview = await invoke("validate_backup", {
    text: JSON.stringify(backup),
  });
  const restored = await invoke("restore_backup", {
    text: JSON.stringify(backup),
    expectedRevision: preview.currentRevision,
    confirmReplace: true,
  });
  expect(restored.snapshot.lifecycle).toEqual(current.lifecycle);
  expect(restored.snapshot.stageHistory).toEqual(current.stageHistory);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "published-v1.json",
    mimeType: "application/json",
    buffer: await readFile(
      "backend/core/tests/fixtures/backup-v1-published-594275a.json",
    ),
  });
  const restore = page.getByRole("dialog", { name: "Restore workspace" });
  await expect(restore).toContainText(
    "All imported items will begin Unreviewed",
  );
  await restore.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("stale stage review preserves its draft and a concurrent sale freezes stage history", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const invoke = async (action: string, payload: unknown = null) => {
    const result = await (
      await page.request.post("/api/request", { data: { action, payload } })
    ).json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  const title = "Lifecycle stale-sale fixture";
  const saved = await invoke("save_lot", {
    ...emptyLot(),
    title,
    url: "https://example.com/lifecycle-sale",
  });
  const lot = saved.lots.find(
    (entry: { input: { title: string } }) => entry.input.title === title,
  );
  const initial = await invoke("purchase", {
    id: lot.input.id,
    acquisitionCents: 1000,
  });
  const item = initial.inventory.find(
    (entry: { lotId: string }) => entry.lotId === lot.input.id,
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: title });
  const open = () =>
    row
      .getByRole("button", { name: `Review stage for ${title}`, exact: true })
      .click();
  const dialog = page.getByRole("dialog", { name: "Inventory stage" });
  await open();
  await dialog.getByLabel("Operational stage").selectOption("listed");
  await invoke("inventory_stage", {
    id: item.id,
    stage: "testing",
    expectedRevision: initial.revision,
  });
  await dialog.getByRole("button", { name: "Save stage", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed since");
  await expect(dialog.getByLabel("Operational stage")).toHaveValue("listed");
  await expect(dialog).toContainText("Unreviewed → Testing");
  await page.screenshot({
    path: testInfo.outputPath("lifecycle-stale-draft.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await open();
  await expect(dialog.getByLabel("Operational stage")).toHaveValue("testing");
  await dialog.getByLabel("Operational stage").selectOption("ready_to_list");
  const sold = await invoke("sell", {
    id: item.id,
    grossCents: 5000,
    expenseCents: 500,
  });
  await dialog.getByRole("button", { name: "Save stage", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Sold");
  await expect(dialog.getByLabel("Operational stage")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save stage", exact: true }),
  ).toHaveCount(0);
  await expect(dialog).toContainText("history are read-only");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(row).toContainText("Sold");
  await expect(row).toContainText("Last stage: Testing");
  const current = await invoke("snapshot");
  expect(current.stageHistory).toEqual(sold.stageHistory);
  expect(current.inventory).toEqual(sold.inventory);
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await open();
  await expect(dialog).toContainText("history are read-only");
  await page.screenshot({
    path: testInfo.outputPath("lifecycle-sold-history.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
});

test("lost stage response retains the draft and retry cannot duplicate committed history", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const invoke = async (action: string, payload: unknown = null) => {
    const result = await (
      await page.request.post("/api/request", { data: { action, payload } })
    ).json();
    expect(result.error).toBeUndefined();
    return result.data;
  };
  const title = "Lifecycle lost-response fixture";
  const saved = await invoke("save_lot", {
    ...emptyLot(),
    title,
    url: "https://example.com/lost-response",
  });
  const lot = saved.lots.find(
    (entry: { input: { title: string } }) => entry.input.title === title,
  );
  const purchased = await invoke("purchase", {
    id: lot.input.id,
    acquisitionCents: 1000,
  });
  const item = purchased.inventory.find(
    (entry: { lotId: string }) => entry.lotId === lot.input.id,
  );
  await page.reload();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  const open = () =>
    page
      .getByRole("button", { name: `Review stage for ${title}`, exact: true })
      .click();
  const dialog = page.getByRole("dialog", { name: "Inventory stage" });
  await open();
  await dialog.getByLabel("Operational stage").selectOption("testing");
  let interrupted = false;
  await page.route("**/api/request", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "inventory_stage" && !interrupted) {
      // The real Rust/SQLite mutation commits; only its browser response is lost.
      const response = await route.fetch();
      const result = await response.json();
      expect(result.error).toBeUndefined();
      interrupted = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Save stage", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Operational stage")).toHaveValue("testing");
  await expect(dialog).toContainText("Unreviewed → Testing");
  const committed = await invoke("backup");
  expect(
    committed.stageEvents.filter(
      (entry: { inventoryId: string }) => entry.inventoryId === item.id,
    ),
  ).toHaveLength(1);
  await dialog.getByRole("button", { name: "Save stage", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("changed since");
  await expect(dialog.getByLabel("Operational stage")).toHaveValue("testing");
  expect(await invoke("backup")).toEqual(committed);
  await page.screenshot({
    path: testInfo.outputPath("lifecycle-lost-response.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await open();
  await expect(dialog.getByLabel("Operational stage")).toHaveValue("testing");
  await expect(
    dialog.getByRole("button", { name: "Save stage", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
