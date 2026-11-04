const planogramRows = [
  {
    maxQty: 3,
    branch: { name: "Makati", status: "active" },
    model: { skuCode: "ACTIVE-1", status: "active" },
  },
  {
    maxQty: 4,
    branch: { name: "Makati", status: "active" },
    model: { skuCode: "RETIRED-1", status: "retired" },
  },
  {
    maxQty: 5,
    branch: { name: "Closed branch", status: "inactive" },
    model: { skuCode: "ACTIVE-2", status: "active" },
  },
];

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchPlanogram: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { model?: { status?: string }; branch?: { status?: string } };
        }) =>
          planogramRows.filter(
            (row) =>
              (!where.model?.status || row.model.status === where.model.status) &&
              (!where.branch?.status || row.branch.status === where.branch.status),
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

import ExcelJS from "exceljs";

import { planogramImportService } from "@/features/planogram/services/planogram-import.service";

describe("planogramImportService.buildTemplate", () => {
  it("leaves out branches and SKUs the import would reject as not active", async () => {
    const buffer = await planogramImportService.buildTemplate({
      tenantId: "t1",
      userId: "u1",
      permissions: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const skus: unknown[] = [];
    workbook.worksheets[0]?.eachRow((row, rowNumber) => {
      if (rowNumber > 1) skus.push(row.getCell(2).value);
    });

    expect(skus).toEqual(["ACTIVE-1"]);
  });
});
