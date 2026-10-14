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
  const names = await page.locator(".book-name").allTextContents();
  expect(names).toContain("Binance hot wallet");
  expect(names.join()).not.toContain("Uniswap"); // an Ethereum contract: not shown for a Tron send
  // about two thirds of the screen
  const sheetBox = (await sheet.boundingBox())!;
  const screenBox = (await page.locator(".phone-screen").boundingBox())!;
  expect(sheetBox.height / screenBox.height).toBeGreaterThan(0.6);
  expect(sheetBox.height / screenBox.height).toBeLessThan(0.72);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/book-2-sheet.png`, clip: await clipOf(page, "#phone-frame") });

  await page.locator(".book-row", { hasText: "HTX hot wallet" }).click();
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
