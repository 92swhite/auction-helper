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
