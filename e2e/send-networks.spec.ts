// Send works on more than Tron: Ethereum, BNB Smart Chain and TON have their own address rules, native coin, fee and
// risk check. Picking a book address answers from the seed (no Worker needed); anything else asks the (mocked) Worker.
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const SHOTS = "docs/designs/redesign/v2";
const WORKER = "https://risk-worker.test";
const book = (JSON.parse(readFileSync("public/address-book.json", "utf8")).entries as Array<{ network: string; address: string; comment: string }>);
const saved = (network: string) => book.filter((e) => e.network === network).length;

async function mockWorker(page: Page, body: unknown, seen: Array<{ network: string; address: string }> = []): Promise<void> {
  await page.route(`${WORKER}/check`, async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    seen.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function openSend(page: Page, network: string, token: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/?list=aegis-super-list&network=${network}&token=${token}`);
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".send-nav-title")).toHaveText(`Send ${token}`);
}

async function pick(page: Page, address: string): Promise<void> {
  await page.locator(".send-book-btn").click();
  await page.locator(`.book-row[aria-label$="${address}"]`).click();
  await expect(page.locator("#send-address")).toHaveValue(address);
  // a long address is never cut off in the field: the text shrinks to fit on one line
  const fits = await page.locator("#send-address").evaluate((el) => (el as HTMLInputElement).scrollWidth <= (el as HTMLInputElement).clientWidth);
  expect(fits, `${address} fits its field`).toBe(true);
}

const entry = (network: string, comment: string) => book.find((e) => e.network === network && e.comment === comment)!;

test("TON: its own address hint and book, a known exchange from the seed, the fee in GRAM, and a simulated send", async ({ page }) => {
  await openSend(page, "TON", "GRAM");
  await expect(page.locator("#send-address")).toHaveAttribute("placeholder", /TON address/);
  await page.locator(".send-book-btn").click();
  await expect(page.locator(".phone-sheet-subtitle")).toHaveText(`TON · ${saved("TON")} saved`);
  const labels = await page.locator(".book-row").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.every((l) => /, (UQ|EQ)[A-Za-z0-9_-]{46}$/.test(l))).toBe(true);
  await page.keyboard.press("Escape");
  await pick(page, entry("TON", "Binance Hot Wallet").address);
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  await page.locator("#send-amount").fill("1");
  await expect(page.locator(".send-fee-value")).toContainText("GRAM");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await page.locator("#phone-frame").screenshot({ path: `${SHOTS}/send-ton.png` });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".send-sent-pill")).toContainText("Simulated");
});

test("TON: an address from another network is refused with a TON message, and an unknown TON address goes to the Worker with network TON", async ({ page }) => {
  const seen: Array<{ network: string; address: string }> = [];
  await mockWorker(page, { level: "clear" }, seen);
  await openSend(page, "TON", "USDT");
  await page.locator("#send-address").fill("not a TON address!"); // an illegal character is wrong at any length
  await expect(page.locator(".send-error").first()).toHaveText("Enter a valid TON address");
  await page.locator("#send-address").fill("TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr"); // a complete Tron address in a TON field: wrong at once
  await expect(page.locator(".send-error").first()).toHaveText("Enter a valid TON address");
  const fresh = "UQBg_wso4rODm-8lCoG-ny54piZbmA7F0k305Eu_8sP7JVlH"; // TIDEX on tonviewer: not in the seed
  await page.locator("#send-address").fill(fresh);
  await expect(page.locator(".send-status-text")).toHaveText("No risk signals found");
  expect(seen).toEqual([{ network: "TON", address: fresh }]);
});

test("Ethereum: EVM address rules, the ETH fee, a risk answer and a token contract warning from the seed", async ({ page }) => {
  await openSend(page, "Ethereum", "USDT");
  await expect(page.locator("#send-address")).toHaveAttribute("placeholder", /Ethereum address/);
  await page.locator("#send-address").fill("not an address!");
  await expect(page.locator(".send-error").first()).toHaveText("Enter a valid Ethereum address");
  await pick(page, entry("ETH", "Joseph Lubin").address); // risky, a known exchange: the name and the risk line
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator(".send-identity-name")).toHaveText("HTX");
  await pick(page, entry("ETH", "USDT token contract (ERC-20)").address);
  await expect(page.locator(".send-status-text")).toHaveText("Token contract: funds sent here are lost");
  await page.locator("#send-amount").fill("5");
  await expect(page.locator(".send-fee-value")).toContainText("ETH");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".phone-dialog")).toContainText("This is a token smart contract");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await page.locator("#phone-frame").screenshot({ path: `${SHOTS}/send-ethereum-contract.png` });
});

test("BNB Smart Chain: the same address as on Ethereum is its own address book entry and its own check", async ({ page }) => {
  const seen: Array<{ network: string; address: string }> = [];
  await mockWorker(page, { level: "clear", label: "Example" }, seen);
  await openSend(page, "BSC", "BNB");
  await page.locator(".send-book-btn").click();
  await expect(page.locator(".phone-sheet-subtitle")).toHaveText(`BNB Smart Chain · ${saved("BSC")} saved`);
  await page.keyboard.press("Escape");
  await pick(page, entry("BSC", "Changpeng Zhao (CZ)").address);
  await expect(page.locator(".send-status-text")).toHaveText("Binance"); // from the seed
  await page.locator("#send-address").fill("0x" + "ab".repeat(20)); // not in the seed: the Worker, as BSC
  await expect(page.locator(".send-status-text")).toHaveText("Example");
  expect(seen).toEqual([{ network: "BSC", address: "0x" + "ab".repeat(20) }]);
});
