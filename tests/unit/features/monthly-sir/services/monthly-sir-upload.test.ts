jest.mock("@/lib/database/client", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
  },
}));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/monthly-sir/repositories/monthly-sir.repository", () => ({
  monthlySirRepository: { findById: jest.fn() },
}));
jest.mock("@/features/stock-audit/services/stock-audit.service", () => ({
  stockAuditService: {},
}));
jest.mock("@/features/monthly-sir/services/monthly-sir.workbook", () => ({
  buildMonthlySirBlankTemplate: jest.fn(),
  buildMonthlySirTemplate: jest.fn(),
  buildMonthlySirVarianceWorkbook: jest.fn(),
  parseMonthlySirUpload: jest.fn(),
}));

import { prisma } from "@/lib/database/client";
import { monthlySirRepository } from "@/features/monthly-sir/repositories/monthly-sir.repository";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import { parseMonthlySirUpload } from "@/features/monthly-sir/services/monthly-sir.workbook";

describe("monthlySirService.previewUpload", () => {
  beforeEach(() => {
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: "branch-1" });
    (monthlySirRepository.findById as jest.Mock).mockResolvedValue({
      id: "req-1",
      branchId: "branch-1",
      status: "approved",
      stockCountSessionId: "sess-1",
      stockCountSession: { status: "in_progress" },
    });
    (parseMonthlySirUpload as jest.Mock).mockResolvedValue([
      { rowNumber: 2, serialNo: "KNOWN", pcount: "STK" },
      { rowNumber: 3, serialNo: "NOT-IN-SYSTEM", pcount: "DU" },
      { rowNumber: 4, serialNo: "DEFECT", pcount: "DEF" },
      { rowNumber: 5, serialNo: "SOLD", pcount: "SLD" },
    ]);
  });

  it("accepts DEF, STK, DU, and unknown serials, and rejects other statuses", async () => {
    const preview = await monthlySirService.previewUpload({
      tenantId: "tenant-1",
      userId: "user-1",
      requestId: "req-1",
      unrestricted: true,
      file: Buffer.from("xlsx"),
    });

    expect(preview.invalidSerials).toEqual([]);
    expect(preview.invalidStatuses).toEqual(["SLD (row 5)"]);
    expect(preview.rowCount).toBe(4);
  });
});
