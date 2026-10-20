import { readFile } from "node:fs/promises";

import { expect, test } from "../fixtures/test";

// Stimulsoft loads ~12 MB of scripts (~24 MB with the designer); under
// `pnpm dev` the first request also compiles them.
test.describe.configure({ timeout: 180_000 });

const REPORT_PAGES = [
  { path: "/reports/processed-orders", title: "Processed Orders" },
  { path: "/reports/daily-stock", title: "Daily Stock" },
  { path: "/reports/transfers", title: "Transfers" },
  { path: "/reports/sales", title: "Sales & Returns" },
  { path: "/reports/inventory", title: "Inventory" },
  { path: "/reports/pcount", title: "P-Count Sessions" },
] as const;

test.describe("report previews", () => {
  for (const { path, title } of REPORT_PAGES) {
    test(`${title}: opens the preview in a modal`, async ({ reportPreviewPage }) => {
      await reportPreviewPage.goto(path);
      await reportPreviewPage.open(title);
      await reportPreviewPage.waitForResult();
      await reportPreviewPage.close();
    });
  }

  test("exports a PDF with the Geist font embedded", async ({ reportPreviewPage }) => {
    await reportPreviewPage.goto("/reports/sales");
    await reportPreviewPage.open("Sales & Returns");
    test.skip((await reportPreviewPage.waitForResult()) === "EMPTY", "No sales rows in this database");

    const download = await reportPreviewPage.exportPdf();
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const pdf = (await readFile(await download.path())).toString("latin1");
    // Subset fonts are named "ABCDEF+Geist"; FontFile2 is the embedded TrueType data.
    expect(pdf).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+Geist/);
    expect(pdf).toContain("/FontFile2");
  });
});

test.describe("custom dashboards", () => {
  test("renders a ready-made dashboard", async ({ customDashboardsPage }) => {
    await customDashboardsPage.goto();
    await customDashboardsPage.openReadyMade("Sales Trends");
    await customDashboardsPage.expectStimulsoftRendered();
  });

  test("copies a ready-made dashboard, saves it in the designer, then deletes it", async ({
    customDashboardsPage,
  }) => {
    await customDashboardsPage.goto();
    await customDashboardsPage.openReadyMade("Sales Trends");
    const id = await customDashboardsPage.copyReadyMade();
    try {
      await customDashboardsPage.expectStimulsoftRendered();
      await customDashboardsPage.saveInDesigner();
    } finally {
      await customDashboardsPage.delete(id);
    }
  });
});
