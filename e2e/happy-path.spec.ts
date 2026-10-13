import { test, expect, type Page } from "@playwright/test";

/** The app opens on the Gallery; enter the studio with the bundled showcase list (it contains the USDY demo token). */
async function openShowcase(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Trust Wallet SDUI Showcase").click();
  await expect(page.getByText("USDY — USDT Yield")).toBeVisible();
}

// The core value-loop E2E test flagged by the eng review's test diagram —
// select network/token, edit, see the simulator update, deploy. This is the
// "2am Friday confidence" test: if this breaks, the whole tool is broken.
test("select a token, edit its JSON, and see the live simulator update", async ({ page }) => {
  await openShowcase(page);

  await page.getByText("USDY — USDT Yield").click();
  await expect(page.locator(".card-header-name")).toContainText("USDT Yield (USDY)");
  await expect(page.locator(".badge-chip")).toContainText("1:1 Backed");

  const editor = page.locator(".json-editor");
  const currentJson = await editor.inputValue();
  const updated = currentJson.replace('"badgeText": "1:1 Backed"', '"badgeText": "Changed!"');
  await editor.fill(updated);

  await expect(page.locator(".badge-chip")).toContainText("Changed!");
  await expect(page.locator(".editor-diagnostics")).not.toHaveClass(/has-errors/);
});

test("default (bundled) registry loads with zero network calls to GitHub", async ({ page }) => {
  const githubRequests: string[] = [];
  page.on("request", (req) => {
    // Token logos legitimately come from raw.githubusercontent.com; the claim is about registry/list data.
    const isRegistryData = req.url().includes("api.github.com") || /raw\.githubusercontent\.com\/.*\.json(\?|$)/.test(req.url());
    if (isRegistryData) {
      githubRequests.push(req.url());
    }
  });

  await openShowcase(page);

  expect(githubRequests).toEqual([]);
});

test("Deploy/Propose on the default registry falls back to a file download", async ({ page }) => {
  await openShowcase(page);
  await page.getByText("USDY — USDT Yield").click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Deploy / Propose Token Card via GitHub" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("USDY.json");
});

test("a broken share-link fragment shows an explicit error, not a blank page", async ({ page }) => {
  await page.goto("/#c=not-a-valid-fragment");
  await expect(page.locator("#status-banner")).toContainText("broken or truncated");
});

// Characterization tests (plan E10): existing phone behavior that the `send` action touches.
// Written before phone-frame.ts changes; they must pass before and after.
test("clicking an existing action widget shows the demo alert with the same text", async ({ page }) => {
  await openShowcase(page);
  await page.getByText("USDY — USDT Yield").click();

  const dialogMessage = new Promise<string>((resolve) => {
    page.once("dialog", async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      resolve(message);
    });
  });
  await page.locator(".phone-screen .widget-action-btn").first().click();

  expect(await dialogMessage).toBe(
    "Action: external_url\nTarget: https://app.example.com/mint?token=USDY" +
      "\n\nYou're leaving to a third-party dApp for USDY. (Simulated — no real navigation occurs.)",
  );
});

test("phone navigation: token list -> token detail -> Back returns to the list", async ({ page }) => {
  await openShowcase(page);
  await expect(page.locator(".phone-list-title")).toBeVisible();

  await page.getByText("USDY — USDT Yield").click();
  await expect(page.locator(".card-header-name")).toContainText("USDT Yield (USDY)");
  await expect(page.locator(".phone-list-title")).toHaveCount(0);

  await page.locator(".card-back-btn").click();
  await expect(page.locator(".phone-list-title")).toBeVisible();
  await expect(page.locator(".card-header-name")).toHaveCount(0);
});

// ---- Send window (plan T12). Addresses in the bundled risk seed (public/risk-seed.json) are answered
// locally; every other address goes to the risk-check Worker, which these tests mock with page.route().
const WORKER = "https://risk-worker.test";
type WorkerAnswer = { status?: number; body?: unknown; delayMs?: number; abort?: boolean };

/** Mocks the Worker's /check (including the CORS preflight) and records the addresses it was asked about. */
async function mockWorker(page: Page, answer: (address: string) => WorkerAnswer): Promise<string[]> {
  const asked: string[] = [];
  await page.route(`${WORKER}/check`, async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const { address } = route.request().postDataJSON() as { address: string };
    asked.push(address);
    const a = answer(address);
    if (a.abort) return route.abort();
    if (a.delayMs) await new Promise((r) => setTimeout(r, a.delayMs));
    return route.fulfill({ status: a.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(a.body ?? { level: "unknown" }) });
  });
  return asked;
}
const SEED_CLEAR_LABELED = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9"; // Binance, clear
const SEED_CAUTION = "THJUJFyTnrBWb1ijWav7qfRBrjUuKgP49Z"; // risky
const NOT_IN_SEED = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";

async function openTronUsdt(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Aegis Super List").click();
  await page.locator(".phone-network-chip", { hasText: "Tron" }).click();
  await page.locator(".phone-token-row", { hasText: "Tether USD" }).first().click();
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
}

async function startSend(page: Page): Promise<void> {
  await openTronUsdt(page);
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".send-nav-title")).toHaveText("Send USDT");
}

test("Send: a clean labeled address -> amount -> Send -> Sent (simulated) -> Done returns to the token", async ({ page }) => {
  await startSend(page);
  await expect(page.locator(".send-form .send-submit")).toBeDisabled();
  await page.locator("#send-address").fill(SEED_CLEAR_LABELED);
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  await page.locator("#send-amount").fill("25.5");
  await expect(page.locator(".send-fee-value")).toContainText("TRX");
  await page.locator(".send-form .send-submit").click();
  await expect(page.locator(".send-sent-headline")).toHaveText("25.5 USDT sent");
  await expect(page.locator(".send-sent-pill")).toHaveText("Simulated — no transaction was sent");
  await page.locator(".send-sent .send-submit").click();
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
});

test("Send: a risky address shows the caution line first, the popup only on Send, with no score or reason", async ({ page }) => {
  await startSend(page);
  await page.locator("#send-address").fill(SEED_CAUTION);
  await page.locator("#send-amount").fill("10");
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator(".phone-overlay")).toHaveCount(0);

  await page.locator(".send-form .send-submit").click();
  const dialog = page.locator(".phone-dialog");
  await expect(dialog).toContainText("Risk signals found for this address");
  await expect(dialog).toContainText("Aegis data at the time of the check shows risk signals. This is information, not advice, and details aren't shown. The decision is yours.");
  expect((await dialog.innerText()).toLowerCase()).not.toMatch(/score|level|reason|sanction|critical/);

  await page.keyboard.press("Escape"); // Esc = Cancel
  await expect(page.locator(".phone-overlay")).toHaveCount(0);
  await expect(page.locator("#send-address")).toHaveValue(SEED_CAUTION);
  await expect(page.locator("#send-amount")).toHaveValue("10");
  await expect(page.locator("#send-address")).toBeFocused();

  await page.locator(".send-form .send-submit").click();
  await page.locator(".phone-dialog button", { hasText: "Continue" }).click();
  await expect(page.locator(".send-sent-headline")).toHaveText("10 USDT sent");
});

test("Send: an address that is not in the seed goes to the Worker; if the Worker is down it is 'Couldn't verify', never safe, and Send is still allowed", async ({ page }) => {
  const asked = await mockWorker(page, () => ({ abort: true }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await page.locator("#send-amount").fill("1");
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  await expect(page.locator(".send-status .send-link")).toBeVisible();
  await expect(page.locator(".send-form .send-submit")).toBeEnabled();
  expect(asked).toEqual([NOT_IN_SEED]);
});

test("Send: seed addresses never call the Worker", async ({ page }) => {
  const asked = await mockWorker(page, () => ({ body: { level: "caution" } }));
  await startSend(page);
  await page.locator("#send-address").fill(SEED_CLEAR_LABELED);
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  expect(asked).toEqual([]);
});

test("Send: the Worker says clear with a label -> shown with the label", async ({ page }) => {
  await mockWorker(page, () => ({ body: { level: "clear", label: "Example Exchange" } }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Example Exchange");
});

test("Send: the Worker says caution -> amber line, popup only on Send, nothing but the agreed copy", async ({ page }) => {
  await mockWorker(page, () => ({ body: { level: "caution" } }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await page.locator("#send-amount").fill("3");
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator(".phone-overlay")).toHaveCount(0);
  await page.locator(".send-form .send-submit").click();
  await expect(page.locator(".phone-dialog")).toContainText("Risk signals found for this address");
});

test("Send: a slow Worker shows 'Checking address…' after the spinner delay, Send waits, then the verdict arrives", async ({ page }) => {
  await mockWorker(page, () => ({ body: { level: "clear" }, delayMs: 1500 }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await page.locator("#send-amount").fill("2");
  await expect(page.locator(".send-status-text")).toHaveText("Checking address…");
  await expect(page.locator(".send-form .send-submit")).toBeDisabled();
  await expect(page.locator(".send-status-text")).toHaveText("No risk signals found");
  await expect(page.locator(".send-form .send-submit")).toBeEnabled();
});

test("Send: a Worker answer with extra fields is not trusted", async ({ page }) => {
  await mockWorker(page, () => ({ body: { level: "clear", score: 1 } }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
});

test("Send: Check again is throttled (10 s), then asks the Worker again and can recover", async ({ page }) => {
  await page.clock.install();
  let n = 0;
  const asked = await mockWorker(page, () => (++n === 1 ? { status: 503 } : { body: { level: "clear" } }));
  await startSend(page);
  await page.locator("#send-address").fill(NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  const again = page.locator(".send-status .send-link");
  await expect(again).toBeDisabled();
  await expect(again).toHaveText(/Check again \(\d+s\)/);
  await again.click({ force: true }); // a disabled button ignores presses
  expect(asked).toHaveLength(1);
  await page.clock.fastForward(11_000);
  await expect(again).toBeEnabled();
  await expect(again).toHaveText("Check again");
  await again.click();
  await expect(page.locator(".send-status-text")).toHaveText("No risk signals found");
  expect(asked).toHaveLength(2);
});

test("Send: Back returns to the token and the form starts fresh next time", async ({ page }) => {
  await startSend(page);
  await page.locator("#send-address").fill(SEED_CLEAR_LABELED);
  await page.locator(".send-back").click();
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator("#send-address")).toHaveValue("");
});

test("Send: an invalid address is rejected inline and the page never leaves the phone (no browser alert)", async ({ page }) => {
  let dialogSeen = false;
  page.on("dialog", async (d) => {
    dialogSeen = true;
    await d.dismiss();
  });
  await startSend(page);
  await page.locator("#send-address").fill(SEED_CLEAR_LABELED.slice(0, -1) + "j");
  await expect(page.locator(".send-error").first()).toHaveText("Enter a valid Tron address");
  expect(dialogSeen).toBe(false);
});

test("Send on a non-Tron token shows the in-phone notice, not a browser alert", async ({ page }) => {
  let dialogSeen = false;
  page.on("dialog", async (d) => {
    dialogSeen = true;
    await d.dismiss();
  });
  await openShowcase(page); // showcase list: USDY is an Ethereum token
  await page.getByText("USDY — USDT Yield").click();
  const editor = page.locator(".json-editor");
  const json = await editor.inputValue();
  const withSend = json
    .replace('"actions": {', '"actions": {\n    "send": { "type": "send" },')
    .replace('"widgets": [', '"widgets": [\n    { "type": "action_group", "items": [{ "label": "Send", "action": "send" }] },');
  await editor.fill(withSend);
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".phone-dialog")).toContainText("Send is available for Tron tokens only");
  await page.locator(".phone-dialog button", { hasText: "OK" }).click();
  await expect(page.locator(".phone-overlay")).toHaveCount(0);
  expect(dialogSeen).toBe(false);
});

// ---- Shareable URL state: ?list=<id>&network=<name>&token=<symbol>
test("a deep link opens the list, the network filter and the asset", async ({ page }) => {
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
  await expect(page.locator(".card-header-meta-item").first()).toContainText("Tron");
  expect(new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron&token=USDT");
});

test("a link with only a list and a network opens the phone's list screen with that filter", async ({ page }) => {
  await page.goto("/?list=aegis-super-list&network=tron");
  await expect(page.locator(".phone-network-chip.active")).toContainText("Tron");
  await expect(page.locator(".card-header-name")).toHaveCount(0);
  // the registry's own spelling is written back
  expect(new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron");
});

test("the URL follows the list, the network filter and the open asset", async ({ page }) => {
  await page.goto("/");
  expect(new URL(page.url()).search).toBe("");
  await page.getByText("Aegis Super List").click();
  await expect.poll(() => new URL(page.url()).search).toBe("?list=aegis-super-list&network=Ethereum");
  await page.locator(".phone-network-chip", { hasText: "Tron" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron");
  await page.locator(".phone-token-row", { hasText: "Tether USD" }).first().click();
  await expect.poll(() => new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron&token=USDT");
  await page.locator(".card-back-btn").click(); // in-phone Back to the token list
  await expect.poll(() => new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron");
  await page.locator("#back-to-gallery").click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
});

test("an unknown list shows a message and the gallery, and unknown network/asset names fall back", async ({ page }) => {
  await page.goto("/?list=does-not-exist");
  await expect(page.locator("#status-banner")).toContainText("was not found");
  await expect(page.getByText("Aegis Super List")).toBeVisible();
  await page.goto("/?list=aegis-super-list&network=Nowhere&token=NOPE");
  await expect(page.locator(".phone-network-chip.active")).toBeVisible();
  await expect(page.locator(".card-header-name")).toHaveCount(0);
});

test("other query parameters survive and a deep link keeps working after Send is opened and closed", async ({ page }) => {
  await page.goto("/?utm=1&list=aegis-super-list&network=Tron&token=USDT");
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".send-nav-title")).toHaveText("Send USDT");
  expect(new URL(page.url()).searchParams.get("token")).toBe("USDT"); // Send is part of the asset view
  expect(new URL(page.url()).searchParams.get("utm")).toBe("1");
});

// ---- Receive: an in-phone dialog with the network's demo address, a QR code and a Copy button
test("Receive on Tron USDT shows the Tron demo address, a QR code, and Copy confirms; the URL does not change", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
  const before = page.url();
  await page.locator(".phone-screen .action-group-btn", { hasText: "Receive" }).click();
  const dialog = page.locator(".phone-dialog");
  await expect(dialog.locator(".phone-dialog-title")).toHaveText("Receive USDT");
  await expect(dialog.locator(".phone-dialog-body")).toHaveText("Network: Tron");
  await expect(dialog.locator(".receive-qr")).toBeVisible();
  const address = (await dialog.locator(".receive-address").textContent())!;
  expect(address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  await dialog.getByRole("button", { name: "Copy address" }).click();
  await expect(dialog.locator(".receive-status")).toHaveText("Address copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address);
  await page.keyboard.press("Escape");
  await expect(page.locator(".phone-dialog")).toHaveCount(0);
  expect(page.url()).toBe(before);
});

test("Receive on an Ethereum token and on a BSC token shows the shared EVM address; no browser alert", async ({ page }) => {
  let alerted = false;
  page.on("dialog", (d) => { alerted = true; void d.dismiss(); });
  await page.goto("/?list=aegis-super-list&network=Ethereum&token=ETH");
  await page.locator(".phone-screen .action-group-btn", { hasText: "Receive" }).click();
  const eth = (await page.locator(".receive-address").textContent())!;
  expect(eth).toMatch(/^0x[0-9a-fA-F]{40}$/);
  await expect(page.locator(".phone-dialog-body")).toHaveText("Network: Ethereum");
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/?list=aegis-super-list&network=BSC&token=USDT");
  await page.locator(".phone-screen .action-group-btn", { hasText: "Receive" }).click();
  await expect(page.locator(".phone-dialog-body")).toHaveText("Network: BNB Smart Chain");
  await expect(page.locator(".receive-address")).toHaveText(eth);
  expect(alerted).toBe(false);
});

test("the Send button is the tall accent one and Receive sits beside it", async ({ page }) => {
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
  const send = page.locator(".phone-screen .action-group-btn.action-primary", { hasText: "Send" });
  const receive = page.locator(".phone-screen .action-group-btn.action-secondary", { hasText: "Receive" });
  // The phone is scaled to fit the window, so read the CSS height, not the scaled box.
  const minHeight = (button: typeof send) => button.evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
  expect(await minHeight(send)).toBeGreaterThanOrEqual(48);
  expect(await minHeight(receive)).toBeGreaterThanOrEqual(48);
});
