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
