import { E2E_USERS } from "../fixtures/users";
import { expect, test } from "../fixtures/test";

// These run signed-out on purpose. Each login uses a different seeded user
// because sign-in is rate-limited per IP + email (see fixtures/users.ts).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("authentication", () => {
  test("redirects anonymous visitors from protected pages to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  });

  test("rejects a wrong password without leaking which field was wrong", async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(E2E_USERS.auditor.email, "definitely-not-the-password");
    await expect(loginPage.error).toBeVisible();
    await expect(loginPage.page).toHaveURL(/\/login/);
  });

  test("signs in and lands on the dashboard", async ({ loginPage, dashboardPage }) => {
    await loginPage.goto();
    const { email, password } = E2E_USERS.ismsManager;
    await loginPage.loginAndWait(email, password, /\/dashboard/);
    await dashboardPage.expectLoaded();
  });

  test("honors a safe callbackUrl after sign-in", async ({ loginPage }) => {
    await loginPage.goto("/policies");
    const { email, password } = E2E_USERS.superAdmin;
    await loginPage.loginAndWait(email, password, /\/policies/);
  });
});
