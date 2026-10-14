// Automated accessibility checks (axe): no serious or critical violations on the main screens, studio and phone mode.
import { test, expect, devices, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];

async function seriousViolations(page: Page): Promise<string[]> {
  // Let entrance animations finish: axe would otherwise measure the contrast of half-transparent text.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("gallery has no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".gallery-card").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("studio (dark and light phone) has no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
  await expect(page.locator(".card-header-name")).toContainText("(USDT)");
  expect(await seriousViolations(page)).toEqual([]);
  await page.locator("#chrome-theme-light").click();
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe("phone mode on an iPhone", () => {
  test.use(iphone);
  test("list, token, Send and Receive have no serious accessibility violations", async ({ page }) => {
    await page.goto("/?list=aegis-super-list&network=Tron");
    await expect(page.locator(".phone-list-title")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
    await expect(page.locator(".card-header-name")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.locator(".phone-screen .action-group-btn", { hasText: "Send" }).click();
    await expect(page.locator(".send-nav-title")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto("/?list=aegis-super-list&network=Tron&token=USDT");
    await page.locator(".phone-screen .action-group-btn", { hasText: "Receive" }).click();
    await expect(page.locator(".phone-dialog")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
