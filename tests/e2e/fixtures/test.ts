import { test as base } from "@playwright/test";

import { CustomDashboardsPage } from "../pages/custom-dashboards.page";
import { DashboardPage } from "../pages/dashboard.page";
import { LoginPage } from "../pages/login.page";
import { ReportPreviewPage } from "../pages/report-preview.page";

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
  reportPreviewPage: ReportPreviewPage;
  customDashboardsPage: CustomDashboardsPage;
};

export const test = base.extend<PageObjects>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  reportPreviewPage: async ({ page }, use) => {
    await use(new ReportPreviewPage(page));
  },
  customDashboardsPage: async ({ page }, use) => {
    await use(new CustomDashboardsPage(page));
  },
});

export { expect } from "@playwright/test";
