import { expect, test as setup } from "@playwright/test";

import { STORAGE_STATE } from "../../playwright.config";
import { E2E_USERS } from "./fixtures/users";
import { DashboardPage } from "./pages/dashboard.page";
import { LoginPage } from "./pages/login.page";

// Runs once before the `chromium` project (see playwright.config.ts) and
// persists the signed-in session so specs don't each pay for a login.
setup("authenticate as the seeded tenant admin", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.loginAndWait(E2E_USERS.admin.email, E2E_USERS.admin.password, /\/dashboard/);
  // Dismiss the first-visit guide here so its localStorage flag is part of the
  // saved state and authenticated specs start on a clean dashboard.
  const dashboard = new DashboardPage(page);
  await expect(page).toHaveURL(/\/dashboard/);
  await dashboard.dismissQuickGuide({ expected: true });
  await expect(dashboard.heading).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
