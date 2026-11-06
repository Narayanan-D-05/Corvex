import { expect, test } from "@playwright/test";

test("landing: hero, navbar behaviour, sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One fair price for every open.");

  const nav = page.getByRole("navigation", { name: "Main" });
  // the bar stays on screen the whole way down
  await expect(nav.getByRole("link", { name: "Launch app" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await expect(nav.getByRole("link", { name: "Launch app" })).toBeVisible();

  await page.evaluate(() => document.getElementById("how")!.scrollIntoView());
  await expect(page.getByRole("heading", { name: "How a cross works" })).toBeVisible();

  // landing links resolve
  for (const href of ["/app", "/replay", "/docs"]) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
  }
});

test("landing: no horizontal scroll on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "Docs" }).last()).toBeVisible();
  await ctx.close();
});

test("replay: scrubber drives the stage and reveals the result", async ({ page }) => {
  await page.goto("/replay");
  await expect(page.getByRole("heading", { name: "Replay" })).toBeVisible();
  await expect(page.getByText("Move the slider to the end")).toBeVisible();
  await page.getByRole("slider", { name: "Replay position" }).fill("1000");
  await expect(page.getByText("Move the slider to the end")).toHaveCount(0);
  await expect(page.getByText("Corvex", { exact: true }).first()).toBeVisible();
});

test("reduced motion: hero renders and page stays usable", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How a cross works" })).toBeVisible();
  await ctx.close();
});
