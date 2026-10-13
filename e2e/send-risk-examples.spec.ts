// What the user sees on the Send screen for each kind of screening answer, with screenshots saved to
// docs/designs/send-risk-screens/ (regenerated on every run). The Worker is mocked; the sanctions example is
// a real OFAC SDN address from the bundled risk seed. Wording rule: we describe what the data shows and never
// recommend an action ("information, not advice").
import { test, expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

const WORKER = "https://risk-worker.test";
const OUT = "docs/designs/send-risk-screens";
const SEED_SANCTIONED = "THJUJFyTnrBWb1ijWav7qfRBrjUuKgP49Z"; // OFAC SDN in the seed: answered locally as caution
const SEED_BINANCE_HOT = "TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf"; // Binance hot wallet in the seed, with its real Aegis logo
const NOT_IN_SEED = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"; // goes to the (mocked) Worker
const LOGO_URL = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/example-exchange.png";

type Answer = unknown | "down";

async function mockWorker(page: Page, answer: Answer): Promise<void> {
  await page.route(`${WORKER}/check`, async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (answer === "down") return route.abort();
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(answer) });
  });
}

/** A 160x160 PNG stand-in for a VASP logo (a gold disc with a dark diamond): real logos come from Aegis via jsDelivr. */
function standInLogo(): Buffer {
  const size = 160;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const dx = x - 79.5, dy = y - 79.5;
      const inDisc = dx * dx + dy * dy <= 78 * 78;
      const inDiamond = Math.abs(dx) + Math.abs(dy) <= 34;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b, a] = !inDisc ? [0, 0, 0, 0] : inDiamond ? [40, 40, 40, 255] : [240, 185, 11, 255];
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function openSend(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto("/");
  await page.getByText("Aegis Super List").click();
  await page.locator(".phone-network-chip", { hasText: "Tron" }).click();
  await page.locator(".phone-token-row", { hasText: "Tether USD" }).first().click();
  await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
  await expect(page.locator(".send-nav-title")).toHaveText("Send USDT");
}

async function enter(page: Page, address: string, amount = "25.5"): Promise<void> {
  await page.locator("#send-address").fill(address);
  await page.locator("#send-amount").fill(amount);
}

const shot = (page: Page, name: string) => page.locator("#phone-frame").screenshot({ path: `${OUT}/${name}.png` });

test("1. an exchange (VASP) with a name and a logo", async ({ page }) => {
  await page.route(LOGO_URL, (route) => route.fulfill({ contentType: "image/png", body: standInLogo() }));
  await mockWorker(page, { level: "clear", label: "Example Exchange", logo: LOGO_URL });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Example Exchange");
  await expect(page.locator(".send-owner-logo")).toBeVisible();
  await expect(page.locator(".send-caption")).toHaveCount(0); // no "Screened with Aegis…" line
  await shot(page, "1-exchange-name-and-logo");
  await page.locator("#chrome-theme-toggle").click();
  await shot(page, "1b-exchange-name-and-logo-light");
});

test("1c. the Binance hot wallet from the seed shows the real logo Aegis returned (no Worker call)", async ({ page }) => {
  // The real image comes from jsDelivr; if the network is unavailable the stand-in is served so the test stays deterministic.
  await page.route("https://cdn.jsdelivr.net/**/*.png", async (route) => {
    try {
      await route.fulfill({ response: await route.fetch({ timeout: 8000 }) });
    } catch {
      await route.fulfill({ contentType: "image/png", body: standInLogo() });
    }
  });
  await openSend(page);
  await enter(page, SEED_BINANCE_HOT);
  await expect(page.locator(".send-status-text")).toHaveText("Binance");
  await expect(page.locator(".send-owner-logo")).toBeVisible({ timeout: 15000 });
  await shot(page, "1c-binance-hot-wallet-real-logo");
});

test("2. an exchange with a name but no logo gets an initial", async ({ page }) => {
  await mockWorker(page, { level: "clear", label: "Example Exchange" });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-owner-initial")).toHaveText("E");
  await expect(page.locator(".send-owner-logo")).toHaveCount(0);
  await shot(page, "2-exchange-name-no-logo");
});

test("3. an answer with a logo URL from another host is not trusted and nothing is fetched from that host", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => { if (r.url().includes("evil.example")) requested.push(r.url()); });
  await mockWorker(page, { level: "clear", label: "Example Exchange", logo: "https://evil.example/logo.png" });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  // the client rejects the whole answer as untrusted: "Couldn't verify", and nothing is fetched from that host
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  expect(requested).toEqual([]);
  await shot(page, "3-untrusted-logo-url-refused");
});

test("4. clear, but no name: only a neutral statement", async ({ page }) => {
  await mockWorker(page, { level: "clear" });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("No risk signals found");
  await shot(page, "4-no-risk-signals-found");
});

test("5. sanctions list match (a real OFAC SDN address from the seed): neutral line, then a popup only on Send", async ({ page }) => {
  await openSend(page);
  await enter(page, SEED_SANCTIONED);
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator(".send-identity")).toBeHidden();
  await shot(page, "5a-sanctions-match-line");
  await page.locator(".send-form .send-submit").click();
  const dialog = page.locator(".phone-dialog");
  await expect(dialog).toContainText("Risk signals found for this address");
  await expect(dialog).toContainText("This is information, not advice");
  await expect(dialog.getByRole("button")).toHaveText(["Cancel", "Continue"]);
  const text = (await dialog.innerText()).toLowerCase();
  expect(text).not.toMatch(/sanction|ofac|sdn|score|reason|critical|high|medium|mixer|scam|recommend|should|safe\b|dangerous|avoid/);
  await shot(page, "5b-sanctions-match-popup");
  await page.locator("#chrome-theme-toggle").click();
  await page.locator("#chrome-style-toggle").click();
  await shot(page, "5c-popup-android-light");
});

test("6. a risky address that is a known exchange: its logo and name, plus the risk line, and the confirmation on Send", async ({ page }) => {
  await page.route(LOGO_URL, (route) => route.fulfill({ contentType: "image/png", body: standInLogo() }));
  await mockWorker(page, { level: "caution", label: "Example Exchange", logo: LOGO_URL }); // the Worker sends no reason
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-identity-name")).toHaveText("Example Exchange");
  await expect(page.locator(".send-identity .send-owner-logo")).toBeVisible();
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await shot(page, "6a-risky-known-exchange-logo-name-and-risk-line");
  await page.locator(".send-form .send-submit").click();
  await expect(page.locator(".phone-dialog")).toContainText("Risk signals found for this address");
  await shot(page, "6b-risky-known-exchange-popup");
});

test("6c. a risky address with no name and no logo: only the risk line", async ({ page }) => {
  await mockWorker(page, { level: "caution" });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Risk signals found for this address");
  await expect(page.locator(".send-identity")).toBeHidden();
  await shot(page, "6c-risky-no-identity-risk-line-only");
});

test("7. a Worker answer with a logo URL from another host is not trusted, on a risky address too", async ({ page }) => {
  await mockWorker(page, { level: "caution", label: "Example Exchange", logo: "https://evil.example/logo.png" });
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  await expect(page.locator("body")).not.toContainText("Example Exchange");
});

test("8. screening unavailable: 'Couldn't verify', never read as safe or as risky", async ({ page }) => {
  await mockWorker(page, "down");
  await openSend(page);
  await enter(page, NOT_IN_SEED);
  await expect(page.locator(".send-status-text")).toHaveText("Couldn't verify this address.");
  await shot(page, "8-could-not-verify");
});
