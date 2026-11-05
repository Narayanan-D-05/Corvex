import { expect, test } from "@playwright/test";

// Walks one weekend through the UI against a fresh local deployment: close, queue, reopen, cross, attest, withdraw.
test("console: full weekend workflow", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("mode")).toHaveText("Normal");

  await page.getByLabel("Demo account").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Get test tokens" }).click();
  await expect(page.getByText("Working: tokens")).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole("button", { name: "Close market" }).click();
  await expect(page.getByTestId("mode")).toHaveText("Dark", { timeout: 30_000 });
  await expect(page.getByText("Market closed: big trades wait for the open.")).toBeVisible();

  // a large buy: the form says it will queue, and then it does
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page.getByLabel(/Amount/).fill("10000");
  await expect(page.getByTestId("hint")).toContainText("Queues until the open");
  await page.getByLabel(/Max price/).fill("215");
  await page.getByRole("button", { name: "Queue order" }).click();
  await expect(page.getByText("Order queued.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("queue").locator("tr")).toHaveCount(1, { timeout: 10_000 });

  // a small buy stays in band and says so
  await page.getByLabel(/Amount/).fill("300");
  await expect(page.getByTestId("hint")).toContainText("Fills now");

  // reopen: the cross is blocked until it runs
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Reopen price").fill("212");
  await page.getByRole("button", { name: "Reopen market" }).click();
  await expect(page.getByTestId("mode")).toHaveText("Awaiting reopen", { timeout: 30_000 });
  await page.getByRole("button", { name: "Run cross" }).click();
  await expect(page.getByTestId("mode")).not.toHaveText("Awaiting reopen", { timeout: 30_000 });

  // the opening print is recorded and reaches the oracles as Recorded, then Attested
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Attest prints" }).click();
  await page.getByRole("button", { name: "Prints", exact: true }).click();
  await expect(page.getByTestId("prints")).toContainText("$212.00", { timeout: 30_000 });
  await expect(page.getByTestId("prints")).toContainText("Attested", { timeout: 30_000 });

  // LPs were paid
  await page.getByRole("button", { name: "Liquidity", exact: true }).click();
  await expect(page.getByTestId("crosses").locator("tbody tr")).toHaveCount(1);

  // the buyer withdraws the fill
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await expect(page.getByText("TSLA").last()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Withdraw" }).first().click();
  await expect(page.getByText("Withdrawn.")).toBeVisible({ timeout: 30_000 });
});
