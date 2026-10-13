// Phone mode (a shared link opens as the bare phone interface on a phone), the device dock, the Share menu, and
// the phone always fitting the window. Screenshots of the new design are saved to docs/designs/redesign/.
import { test, expect, devices } from "@playwright/test";

const LINK = "/?list=aegis-super-list&network=Tron&token=USDT";
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
const SHOTS = "docs/designs/redesign";

test.describe("on an iPhone", () => {
  test.use(iphone);

  test("a shared link opens as the phone interface: no sidebar, editor or toolbar, edge to edge", async ({ page }) => {
    await page.goto(LINK);
    await expect(page.locator(".card-header-name")).toContainText("(USDT)");
    for (const hidden of [".sidebar", ".editor-panel", ".topbar", ".device-dock"]) await expect(page.locator(hidden)).toBeHidden();
    const frame = await page.locator(".phone-frame").boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.round(frame!.width)).toBe(viewport.width);
    expect(Math.round(frame!.height)).toBe(viewport.height);
    // No device bezel pieces on a real phone
    await expect(page.locator(".phone-notch")).toBeHidden();
    await expect(page.locator(".phone-home-indicator")).toBeHidden();
    // it looks like an iPhone, and the URL still mirrors the screen (no view parameter was added)
    await expect(page.locator(".phone-frame")).toHaveClass(/chrome-ios/);
    expect(new URL(page.url()).search).toBe("?list=aegis-super-list&network=Tron&token=USDT");
    await page.screenshot({ path: `${SHOTS}/iphone-token.png` });
  });

  test("the list screen has a way back to the gallery, and the gallery is a single column", async ({ page }) => {
    await page.goto("/?list=aegis-super-list&network=Tron");
    await page.screenshot({ path: `${SHOTS}/iphone-list.png` });
    await page.locator(".phone-list-exit", { hasText: "Lists" }).click();
    await expect(page.locator(".gallery-card").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/iphone-gallery.png` });
    const boxes = await page.locator(".gallery-card").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
    expect(new Set(boxes.map(Math.round)).size).toBe(1);
  });

  test("?view=studio forces the full studio even on a phone", async ({ page }) => {
    await page.goto(`${LINK}&view=studio`);
    await expect(page.locator(".topbar")).toBeVisible();
  });
});

test.describe("on a desktop", () => {
  test("?view=phone shows only the phone, drawn as a device, and Studio leads back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?list=aegis-super-list&network=Tron&view=phone");
    await expect(page.locator(".phone-list-title")).toBeVisible();
    for (const hidden of [".sidebar", ".editor-panel", ".topbar", ".device-dock"]) await expect(page.locator(hidden)).toBeHidden();
    await expect(page.locator(".phone-notch")).toBeVisible(); // a framed device, not fullscreen
    await page.screenshot({ path: `${SHOTS}/desktop-phone-view.png` });
    await page.locator(".phone-list-exit", { hasText: "Studio" }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".device-dock")).toBeVisible();
  });

  test("the whole phone and the dock fit the window, at a small and a large size", async ({ page }) => {
    for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.goto(LINK);
      await expect(page.locator(".card-header-name")).toContainText("(USDT)");
      const frame = (await page.locator(".phone-frame").boundingBox())!;
      const dock = (await page.locator(".device-dock").boundingBox())!;
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.y + frame.height).toBeLessThanOrEqual(dock.y + 1);
      expect(dock.y + dock.height).toBeLessThanOrEqual(size.height);
    }
  });

  test("the dock switches platform and appearance; the choice is shown as selected", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LINK);
    await expect(page.locator("#chrome-style-ios")).toHaveAttribute("aria-checked", "true");
    await page.locator("#chrome-style-android").click();
    await expect(page.locator(".phone-frame")).toHaveClass(/chrome-android/);
    await expect(page.locator("#chrome-style-android")).toHaveAttribute("aria-checked", "true");
    await page.locator("#chrome-theme-light").click();
    await expect(page.locator(".phone-frame")).toHaveClass(/theme-light/);
    await expect(page.locator("#chrome-theme-dark")).toHaveAttribute("aria-checked", "false");
  });

  test("Share: Copy link and Copy phone link put the right address on the clipboard, with a toast", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LINK);
    await page.locator("#share-menu-btn").click();
    await page.getByRole("menuitem", { name: /^Copy link/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:5173${LINK}`);
    await expect(page.locator(".toast")).toHaveText("Link copied");

    await page.locator("#share-menu-btn").click();
    await page.getByRole("menuitem", { name: /^Copy phone link/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:5173${LINK}&view=phone`);
    await expect(page.locator(".toast")).toHaveText("Phone link copied");
  });

  test("the Share menu closes on Escape and returns focus to its button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(LINK);
    await page.locator("#share-menu-btn").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("#share-menu-btn")).toBeFocused();
  });

  test("design shots: gallery and studio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".gallery-card").first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/gallery.png` });
    await page.goto(LINK);
    await expect(page.locator(".card-header-name")).toContainText("(USDT)");
    await page.screenshot({ path: `${SHOTS}/studio-token.png` });
    await page.goto("/?list=aegis-super-list&network=Tron");
    await expect(page.locator(".phone-list-title")).toBeVisible();
    await page.locator("#chrome-theme-light").click();
    await page.screenshot({ path: `${SHOTS}/studio-list-light.png` });
  });
});
