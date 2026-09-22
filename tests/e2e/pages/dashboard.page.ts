import { expect, type Locator, type Page } from "@playwright/test";

export class DashboardPage {
  readonly heading: Locator;
  /** First-visit "quick guide" modal (PageTutorialTrigger); dismissal is kept in localStorage. */
  readonly quickGuide: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { level: 1, name: "Dashboard" });
    this.quickGuide = page.getByRole("dialog", { name: /quick guide/i });
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

  /**
   * The guide auto-opens from an effect shortly after hydration and, being a
   * modal, hides the rest of the page from the accessibility tree. Give it a
   * moment to appear; when it was already dismissed (localStorage) this just
   * costs the short wait.
   */
  async dismissQuickGuide({ expected = false }: { expected?: boolean } = {}) {
    if (expected) {
      await expect(this.quickGuide).toBeVisible();
    } else {
      await this.quickGuide.waitFor({ state: "visible", timeout: 1_500 }).catch(() => undefined);
    }
    if (await this.quickGuide.isVisible()) {
      await this.quickGuide.getByRole("button", { name: /got it/i }).click();
      await expect(this.quickGuide).toBeHidden();
    }
  }
}
