import { expect, type Locator, type Page } from "@playwright/test";

import { dismissQuickGuide } from "./quick-guide";

export class DashboardPage {
  readonly heading: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Overview" });
  }

  async goto() {
    await this.page.goto("/dashboard");
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/dashboard/);
    await this.dismissQuickGuide();
    await expect(this.heading).toBeVisible();
  }

  async dismissQuickGuide(options?: { expected?: boolean }) {
    await dismissQuickGuide(this.page, options);
  }
}
