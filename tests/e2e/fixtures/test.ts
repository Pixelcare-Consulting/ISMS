import { test as base } from "@playwright/test";

import { DashboardPage } from "../pages/dashboard.page";
import { LoginPage } from "../pages/login.page";

/**
 * Page-object fixtures. Specs import `test`/`expect` from here instead of
 * `@playwright/test` and receive ready-made page objects per test:
 *
 *   test("…", async ({ dashboardPage }) => { await dashboardPage.goto(); });
 *
 * Add a new page object = add a class in ../pages and a line below.
 */
type PageObjects = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
};

export const test = base.extend<PageObjects>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
});

export { expect } from "@playwright/test";
