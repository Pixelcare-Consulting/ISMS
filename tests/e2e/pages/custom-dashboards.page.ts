import { expect, type Locator, type Page } from "@playwright/test";

import { dismissQuickGuide } from "./quick-guide";

/** /dashboard/custom: ready-made dashboards, the viewer and the designer. */
export class CustomDashboardsPage {
  /** Host div that Stimulsoft renders the viewer or designer into. */
  readonly stimulsoftHost: Locator;

  constructor(readonly page: Page) {
    this.stimulsoftHost = page.locator(".stimulsoft-host");
  }

  async goto() {
    await this.page.goto("/dashboard/custom");
    await dismissQuickGuide(this.page);
    await expect(this.page.getByRole("heading", { level: 1, name: "Custom Dashboards" })).toBeVisible();
  }

  async openReadyMade(name: string) {
    // Scoped to the section: copies are listed below as "<name> (my copy)".
    await this.page.getByRole("region", { name: "Ready-made" }).getByRole("link", { name: new RegExp(name) }).click();
    await expect(this.page.getByRole("heading", { level: 1, name })).toBeVisible();
    await dismissQuickGuide(this.page);
  }

  /** Stimulsoft has rendered something into the frame and no error is shown. */
  async expectStimulsoftRendered() {
    await expect(this.stimulsoftHost.locator(":scope > *").first()).toBeAttached({ timeout: 120_000 });
    await expect(this.page.getByRole("alert").filter({ hasText: /could not load/i })).toHaveCount(0);
  }

  /** Copies the open ready-made dashboard and returns the new dashboard's id (from the /edit URL). */
  async copyReadyMade(): Promise<string> {
    await this.page.getByRole("button", { name: "Copy and customize" }).click();
    await this.page.waitForURL(/\/dashboard\/custom\/[^/]+\/edit$/);
    await dismissQuickGuide(this.page);
    const id = new URL(this.page.url()).pathname.split("/").at(-2);
    if (!id) throw new Error(`No dashboard id in ${this.page.url()}`);
    return id;
  }

  /** Clicks Save in the Stimulsoft designer ribbon. */
  async saveInDesigner() {
    await this.stimulsoftHost.getByText("Save", { exact: true }).first().click();
    await expect(this.page.getByText("Dashboard saved")).toBeVisible();
  }

  async delete(id: string) {
    await this.goto();
    const row = this.page.getByRole("listitem").filter({ has: this.page.locator(`a[href="/dashboard/custom/${id}"]`) });
    await row.getByRole("button", { name: "Delete" }).click();
    await this.page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(this.page.getByText("Dashboard deleted")).toBeVisible();
  }
}
