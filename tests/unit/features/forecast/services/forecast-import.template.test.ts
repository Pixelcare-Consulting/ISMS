const planogramRows = [
  {
    branchId: "b1",
    modelId: "m1",
    branch: { name: "Makati", status: "active" },
    model: { skuCode: "ACTIVE-1", status: "active" },
  },
  {
    branchId: "b1",
    modelId: "m2",
    branch: { name: "Makati", status: "active" },
    model: { skuCode: "RETIRED-1", status: "retired" },
  },
];

jest.mock("@/lib/database/client", () => ({
  prisma: {
    planningPeriod: {
      findFirst: jest.fn().mockResolvedValue({ id: "period-1", label: "Jan-27" }),
    },
    skuForecastTarget: { findMany: jest.fn().mockResolvedValue([]) },
    branchPlanogram: {
      findMany: jest.fn(
        async ({ where }: { where: { model?: { status?: string } } }) =>
          planogramRows.filter(
            (row) => !where.model?.status || row.model.status === where.model.status,
          ),
      ),
    },
  },
}));

jest.mock("@/lib/auth/permissions", () => ({ hasPermission: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/aor/scope", () => ({ getUserBranchIds: jest.fn() }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn(), logMany: jest.fn() },
}));
jest.mock("@/features/planogram/services/planogram-forecast-refresh.service", () => ({
  planogramForecastRefreshService: { refreshForBranches: jest.fn() },
}));

import ExcelJS from "exceljs";

import { forecastImportService } from "@/features/forecast/services/forecast-import.service";

describe("forecastImportService.buildTemplate", () => {
  it("leaves out SKUs the import would reject as not active", async () => {
    const buffer = await forecastImportService.buildTemplate({
      tenantId: "t1",
      userId: "u1",
      permissions: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const skus: unknown[] = [];
    workbook.worksheets[0]?.eachRow((row, rowNumber) => {
      if (rowNumber > 1) skus.push(row.getCell(3).value);
    });

    expect(skus).toEqual(["ACTIVE-1"]);
  });
});
