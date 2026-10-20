import { expect, type Download, type Locator, type Page } from "@playwright/test";

import { dismissQuickGuide } from "./quick-guide";

/** A /reports/* page and its Stimulsoft preview modal (features/reporting/components/report-preview.tsx). */
export class ReportPreviewPage {
  readonly dialog: Locator;
  /** Stimulsoft toolbar button; present once the viewer has rendered a report. */
  readonly saveMenu: Locator;
  readonly noRows: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole("dialog");
    this.saveMenu = this.dialog.getByText("Save", { exact: true });
    this.noRows = this.dialog.getByText("No rows match these filters.");
  }

  async goto(path: string) {
    await this.page.goto(path);
    await dismissQuickGuide(this.page);
  }

  async open(title: string) {
    await this.page.getByRole("button", { name: "Preview report" }).click();
    await expect(this.dialog.getByRole("heading", { name: title })).toBeVisible();
  }

  /** Waits for either a rendered report or the empty state (demo data varies per report). */
  async waitForResult(): Promise<"REPORT" | "EMPTY"> {
    await expect(this.saveMenu.or(this.noRows)).toBeVisible({ timeout: 120_000 });
    return (await this.noRows.isVisible()) ? "EMPTY" : "REPORT";
  }

  /** Save → Adobe PDF → OK in the export settings form. */
  async exportPdf(): Promise<Download> {
    await this.saveMenu.click();
    await this.page.getByText("Adobe PDF").first().click();
    const download = this.page.waitForEvent("download");
    await this.page.getByText("OK", { exact: true }).filter({ visible: true }).last().click();
    return download;
  }

  async close() {
    await this.page.keyboard.press("Escape");
    await expect(this.dialog).toBeHidden();
  }
}
