import { expect, test } from "../fixtures/test";

// Uses the stored session from auth.setup.ts.
test.describe("dashboard (signed in)", () => {
  test("loads for an authenticated user", async ({ dashboardPage }) => {
    await dashboardPage.goto();
  });

  test("keeps signed-in users away from the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
