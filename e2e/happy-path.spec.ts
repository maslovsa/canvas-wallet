import { test, expect } from "@playwright/test";

// The core value-loop E2E test flagged by the eng review's test diagram —
// select network/token, edit, see the simulator update, deploy. This is the
// "2am Friday confidence" test: if this breaks, the whole tool is broken.
test("select a token, edit its JSON, and see the live simulator update", async ({ page }) => {
  await page.goto("/");

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
    if (req.url().includes("api.github.com") || req.url().includes("raw.githubusercontent.com")) {
      githubRequests.push(req.url());
    }
  });

  await page.goto("/");
  await expect(page.getByText("USDY — USDT Yield")).toBeVisible();

  expect(githubRequests).toEqual([]);
});

test("Deploy/Propose on the default registry falls back to a file download", async ({ page }) => {
  await page.goto("/");
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
