// The address book: a small book button at the end of the To field opens a bottom sheet (about two thirds of the
// screen) with the saved recipients for the network; choosing one fills the field and closes the sheet.
import { test, expect, devices, type Page } from "@playwright/test";

const SHOTS = "docs/designs/redesign/v2";
const WORKER = "https://risk-worker.test";
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];

async function mockWorker(page: Page, body: unknown): Promise<void> {
  await page.route(`${WORKER}/check`, async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function openSend(page: Page): Promise<void> {
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".send-nav-title")).toHaveText("Send USDT");
}

test("the book button opens a sheet with the Tron addresses only; picking one fills the field and closes the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorker(page, { level: "caution" });
  await openSend(page);
  const field = page.locator(".send-field");
  await expect(field.locator(".send-book-btn")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/book-1-send.png`, clip: await clipOf(page, "#phone-frame") });
  await field.locator(".send-book-btn").click();
  const sheet = page.locator(".phone-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.locator(".phone-sheet-title")).toHaveText("Address book");
  await expect(page.locator(".phone-sheet-subtitle")).toHaveText("Tron · 12 saved");
  // only Tron addresses: every row's address starts with T; no 0x (Ethereum / BSC) address appears
  const labels = await page.locator(".book-row").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels).toHaveLength(12);
  expect(labels.every((l) => /, T[1-9A-HJ-NP-Za-km-z]{33}$/.test(l))).toBe(true);
  // about two thirds of the screen
  const sheetBox = (await sheet.boundingBox())!;
  const screenBox = (await page.locator(".phone-screen").boundingBox())!;
  expect(sheetBox.height / screenBox.height).toBeGreaterThan(0.6);
  expect(sheetBox.height / screenBox.height).toBeLessThan(0.72);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/book-2-sheet.png`, clip: await clipOf(page, "#phone-frame") });

  await page.locator('.book-row[aria-label$="TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR"]').click();
  await expect(page.locator("#send-address")).toHaveValue("TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR");
  await expect(page.locator(".phone-sheet")).toHaveCount(0);
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator("#send-amount")).toBeFocused();
  await page.screenshot({ path: `${SHOTS}/book-3-picked.png`, clip: await clipOf(page, "#phone-frame") });
});

test("the sheet closes with Escape, the close button, the scrim, and by dragging it down", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSend(page);
  const open = async () => {
    await page.locator(".send-book-btn").click();
    await expect(page.locator(".phone-sheet")).toBeVisible();
  };
  await open();
  await page.keyboard.press("Escape");
  await expect(page.locator(".phone-sheet")).toHaveCount(0);
  await expect(page.locator(".send-book-btn")).toBeFocused(); // focus returns to the button

  await open();
  await page.locator(".phone-sheet-close").click();
  await expect(page.locator(".phone-sheet")).toHaveCount(0);

  await open();
  const screenBox = (await page.locator(".phone-screen").boundingBox())!;
  await page.mouse.click(screenBox.x + screenBox.width / 2, screenBox.y + 40); // the dimmed area above the sheet
  await expect(page.locator(".phone-sheet")).toHaveCount(0);

  await open();
  const grab = (await page.locator(".phone-sheet-grabber").boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 120, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".phone-sheet")).toHaveCount(0);
});

test("on an iPhone the sheet is reachable by touch-sized targets and fills the width", async ({ browser }) => {
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  await openSend(page);
  const button = (await page.locator(".send-book-btn").boundingBox())!;
  expect(button.width).toBeGreaterThanOrEqual(40);
  expect(button.height).toBeGreaterThanOrEqual(40);
  await page.locator(".send-book-btn").click();
  const sheet = (await page.locator(".phone-sheet").boundingBox())!;
  expect(Math.round(sheet.width)).toBe(page.viewportSize()!.width);
  const rows = await page.locator(".book-row").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...rows)).toBeGreaterThanOrEqual(56);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/book-4-iphone.png` });
  await context.close();
});

test("Android: the same sheet with Material proportions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSend(page);
  await page.locator("#chrome-style-android").click();
  await page.locator(".phone-screen .send-back, .card-back-btn").first().waitFor({ state: "attached" }).catch(() => undefined);
  await page.locator(".send-book-btn").click();
  await page.waitForTimeout(500);
  await expect(page.locator(".phone-sheet")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/book-5-android.png`, clip: await clipOf(page, "#phone-frame") });
});

async function clipOf(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

// ---- every Tron address of the book is answered (from the risk seed), none ends in "Couldn't verify"
import { readFileSync, mkdirSync } from "node:fs";
const BOOK = JSON.parse(readFileSync("public/address-book.json", "utf8")).entries as Array<{ network: string; address: string; comment: string }>;
const nameOf = (address: string) => BOOK.find((e) => e.address === address)!.comment;

test("every Tron address in the address book gets a real answer, matching the risk seed", async ({ page }) => {
  const book = (JSON.parse(readFileSync("public/address-book.json", "utf8")).entries as Array<{ network: string; address: string; comment: string }>).filter((e) => e.network === "TRON");
  const seed = new Map((JSON.parse(readFileSync("public/risk-seed.json", "utf8")).entries as Array<{ address: string; level: string; label?: string }>).map((e) => [e.address, e]));
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") }); // the seed's 90-day freshness is measured from "now"
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSend(page);
  const outDir = process.env.SHOT_DIR;
  if (outDir) mkdirSync(outDir, { recursive: true });
  const table: string[] = [];
  for (const [i, entry] of book.entries()) {
    await page.locator("#send-address").fill("");
    await page.locator(".send-book-btn").click();
    await page.locator(".book-row").nth(i).click();
    await expect(page.locator("#send-address")).toHaveValue(entry.address);
    const status = page.locator(".send-status-text");
    await expect(status).not.toHaveText("", { timeout: 5000 });
    await expect(status).not.toHaveText("Checking address…");
    const text = (await status.textContent())!;
    const expected = seed.get(entry.address)!;
    expect(text, `${entry.comment} (${entry.address})`).not.toBe("Couldn't verify this address.");
    if (expected.level === "caution") expect(text).toBe("Risk signals found for this address");
    else expect(text).toBe(expected.label ?? "No risk signals found");
    table.push(`${String(i + 1).padStart(2)}. ${entry.comment.padEnd(30)} ${entry.address.slice(0, 8)}…  ->  ${text}`);
    if (outDir) await page.locator("#phone-frame").screenshot({ path: `${outDir}/${String(i + 1).padStart(2, "0")}.png` });
  }
  console.log(`\nADDRESS BOOK RUN (${book.length} Tron addresses)\n${table.join("\n")}`);
});

// ---- the destination in the link: ?to=<address> opens Send with the recipient filled in
test("?to= opens Send for the token with the recipient filled in and checked; the link keeps it while on Send", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT&to=TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9");
  await expect(page.locator(".send-nav-title")).toHaveText("Send USDT");
  await expect(page.locator("#send-address")).toHaveValue("TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9");
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  expect(new URL(page.url()).searchParams.get("to")).toBe("TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9");
  await page.locator(".send-back").click(); // leaving Send drops the recipient from the link
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
  expect(new URL(page.url()).searchParams.has("to")).toBe(false);
  expect(new URL(page.url()).searchParams.get("token")).toBe("USDT");
});

test("Copy link from the Send screen carries the recipient currently in the field", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSend(page);
  await page.locator("#send-address").fill("TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe");
  await page.locator("#share-menu-btn").click();
  await page.getByRole("menuitem", { name: /^Copy link/ }).click();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.searchParams.get("to")).toBe("TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe");
  expect(copied.searchParams.get("token")).toBe("USDT");
});

test("?to= with a bad address shows the field's own error; for a token that cannot be sent (or no token) it is ignored", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT&to=not-an-address");
  await expect(page.locator("#send-address")).toHaveValue("not-an-address");
  await expect(page.locator(".send-error").first()).not.toHaveText("");
  await page.goto("/?list=aegis-super-list&network=Ethereum&token=ETH&to=TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9");
  await expect(page.locator(".card-header-name")).toContainText("(ETH)"); // not a Tron token: stays on the card
  await expect(page.locator(".send-nav-title")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.has("to")).toBe(false);
  await page.goto("/?list=aegis-super-list&network=Tron&to=TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9");
  await expect(page.locator(".phone-list-title")).toBeVisible(); // no token: the list, no Send
});

// ---- the "could not verify" badge is an emoji in the logo's slot, not a bare "?"
test("when the check cannot complete the status shows an emoji badge the size of an owner logo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 }); // tall enough that the phone is shown at its real size
  await page.route(`${WORKER}/check`, (route) => route.abort());
  await openSend(page);
  await page.locator("#send-address").fill("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"); // not in the seed: goes to the (down) Worker
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  const emoji = page.locator(".send-status .send-owner-emoji");
  await expect(emoji).toHaveText("❓");
  const box = (await emoji.boundingBox())!; // 24 px: the size of an owner logo
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([24, 24]);
  await expect(page.locator(".send-status-icon")).toHaveText(""); // no "?" glyph any more
  await page.locator("#phone-frame").screenshot({ path: `${SHOTS}/couldnt-verify-emoji.png` });
});

// ---- "To: NAME": the saved name of the address in the field
test("the To label carries the saved name after a pick, and loses it when another address is typed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorker(page, { level: "caution" });
  await openSend(page);
  const label = page.locator("label[for=send-address]");
  await expect(label).toHaveText("To");
  const HTX = "TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR";
  await page.locator(".send-book-btn").click();
  await page.locator(`.book-row[aria-label$="${HTX}"]`).click();
  await expect(label).toHaveText(`To: ${nameOf(HTX)}`);
  await page.screenshot({ path: `${SHOTS}/book-6-to-name.png`, clip: await clipOf(page, "#phone-frame") });
  await page.locator("#send-address").fill("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"); // not in the book
  await expect(label).toHaveText("To");
  await page.locator("#send-address").fill("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr"); // typed, but it is a saved address
  await expect(label).toHaveText(`To: ${nameOf("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr")}`);
  await page.locator("#send-address").fill("");
  await expect(label).toHaveText("To");
});

test("a ?to= link with a saved address shows its name; with an unknown one it does not", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorker(page, { level: "caution" });
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT&to=TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa");
  await expect(page.locator("label[for=send-address]")).toHaveText(`To: ${nameOf("TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa")}`);
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT&to=TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7");
  await expect(page.locator("label[for=send-address]")).toHaveText("To");
});

// ---- the address bar follows the address typed on Send
test("typing an address on Send puts it in the page address (?to=), live; clearing or leaving removes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSend(page);
  const to = () => new URL(page.url()).searchParams.get("to");
  expect(to()).toBeNull();
  await page.locator("#send-address").fill("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
  await expect.poll(to).toBe("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
  expect(new URL(page.url()).searchParams.get("token")).toBe("USDT"); // the rest of the link is intact
  await page.locator("#send-address").fill("TM1zzNDZD2DPASbKcgdVoTYhfmYgtfwx9R");
  await expect.poll(to).toBe("TM1zzNDZD2DPASbKcgdVoTYhfmYgtfwx9R");
  await page.locator("#send-address").fill("");
  await expect.poll(to).toBeNull();
  await page.locator("#send-address").fill("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
  await expect.poll(to).not.toBeNull();
  await page.locator(".send-back").click();
  await expect.poll(to).toBeNull();
  // and the link round-trips: opening it shows the same address
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT&to=TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
  await expect(page.locator("#send-address")).toHaveValue("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
});

// ---- addresses of known exchanges: the exchange's logo and name, and nothing about risk
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("every known-exchange address in the risk seed shows the exchange's logo and name and no risk wording", async ({ page }) => {
  const seed = (JSON.parse(readFileSync("public/risk-seed.json", "utf8")).entries as Array<{ address: string; level: string; label?: string; logo?: string }>).filter((e) => e.level === "clear" && e.label && e.logo);
  expect(seed.length).toBeGreaterThanOrEqual(5); // Binance (x3), Bybit, OKX, Bitget ...
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.route("https://cdn.jsdelivr.net/**/*.png", (route) => route.fulfill({ contentType: "image/png", body: PIXEL })); // the logos, offline
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openSend(page);
  const rows: string[] = [];
  for (const entry of seed) {
    await page.locator("#send-address").fill(entry.address);
    const status = page.locator(".send-status-text");
    await expect(status, entry.address).toHaveText(entry.label!);
    const img = page.locator(".send-status .send-owner-logo");
    await expect(img).toHaveAttribute("src", entry.logo!);
    await expect(img).toBeVisible(); // the logo loaded (not just the initial placeholder)
    const wording = (await page.locator(".send-status").innerText()).toLowerCase();
    expect(wording).not.toMatch(/risk|caution|sanction|⚠/);
    await expect(page.locator(".send-status.send-tone-caution")).toHaveCount(0);
    await expect(page.locator(".send-identity")).toBeHidden(); // that row is for a risky address that is also a known exchange
    rows.push(`${entry.address.slice(0, 8)}…  ${entry.label}`);
  }
  console.log(`\nKNOWN EXCHANGES (${seed.length})\n${rows.join("\n")}`);
});

test("the Binance hot wallet TAzsQ9Gx… shows Binance with its logo and no risk line", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T12:00:00Z") });
  await page.route("https://cdn.jsdelivr.net/**/*.png", (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
  await page.setViewportSize({ width: 1440, height: 1200 });
  await openSend(page);
  await page.locator("#send-address").fill("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  await expect(page.locator(".send-status .send-owner-logo")).toHaveAttribute("src", /binance-com\.png$/);
  await expect(page.locator(".send-status")).not.toContainText(/risk/i);
});
