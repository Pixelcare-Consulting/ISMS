import { inventoryApprovalRepository } from "@/features/inventory-approvals/repositories/inventory-approval.repository";
import { prisma } from "@/lib/database/client";

jest.mock("@/lib/database/client", () => ({
  prisma: {
    inventoryApproval: { findMany: jest.fn(), count: jest.fn() },
    branchDefectReportPhoto: { findMany: jest.fn() },
    branchPulloutAttachment: { findMany: jest.fn() },
  },
}));

const db = jest.mocked(prisma, { shallow: false }) as unknown as {
  inventoryApproval: { findMany: jest.Mock; count: jest.Mock };
  branchDefectReportPhoto: { findMany: jest.Mock };
  branchPulloutAttachment: { findMany: jest.Mock };
};

const row = {
  id: "row-1",
  sourceType: "PULLOUT",
  sourceId: "pullout-1",
  sourceNo: "PO-1",
  step: "TL_APPROVAL",
  status: "REJECTED",
  remarks: "Wrong unit",
  problemDescription: "No power",
  createdAt: new Date("2026-11-06T01:00:00.000Z"),
  decidedAt: new Date("2026-11-06T02:00:00.000Z"),
  serialNumber: { serialNo: "SN1", model: { skuCode: "SKU", name: "Phone" } },
  requestedBy: { name: "Ana", email: "ana@example.com" },
  decidedBy: { name: "  ", email: "tl@example.com" },
};

beforeEach(() => {
  jest.clearAllMocks();
  db.inventoryApproval.findMany.mockResolvedValue([row]);
  db.inventoryApproval.count.mockResolvedValue(1);
  db.branchDefectReportPhoto.findMany.mockResolvedValue([]);
  db.branchPulloutAttachment.findMany.mockResolvedValue([]);
});

describe("inventoryApprovalRepository.list", () => {
  it("shows the newest movement first and scopes to the tenant", async () => {
    const result = await inventoryApprovalRepository.list("t1", { page: 2, limit: 25 });

    expect(db.inventoryApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: 25,
        take: 25,
      }),
    );
    expect(result).toMatchObject({ total: 1, page: 2, limit: 25 });
  });

  it("maps a row for display, naming a blank-named user by email", async () => {
    const { items } = await inventoryApprovalRepository.list("t1", {});

    expect(items[0]).toEqual({
      id: "row-1",
      serialNo: "SN1",
      modelLabel: "SKU · Phone",
      sourceType: "PULLOUT",
      sourceNo: "PO-1",
      step: "TL_APPROVAL",
      status: "REJECTED",
      requestedBy: "Ana",
      requestedAt: "2026-11-06T01:00:00.000Z",
      decidedBy: "tl@example.com",
      decidedAt: "2026-11-06T02:00:00.000Z",
      remarks: "Wrong unit",
      problemDescription: "No power",
      attachments: [],
    });
  });

  it("applies status, document, search and date filters", async () => {
    await inventoryApprovalRepository.list("t1", {
      status: "PENDING",
      sourceType: "TRANSFER",
      q: " SN1 ",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-06",
    });

    const { where } = db.inventoryApproval.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ tenantId: "t1", status: "PENDING", sourceType: "TRANSFER" });
    expect(where.updatedAt.gte).toBeInstanceOf(Date);
    expect(where.updatedAt.lte).toBeInstanceOf(Date);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { sourceNo: { contains: "SN1", mode: "insensitive" } },
        { serialNumber: { serialNo: { contains: "SN1", mode: "insensitive" } } },
      ]),
    );
    expect(db.inventoryApproval.count).toHaveBeenCalledWith({ where });
  });

  it("links the document's current files without storing a copy", async () => {
    db.inventoryApproval.findMany.mockResolvedValue([
      row,
      { ...row, id: "row-2", sourceType: "DEFECT_REPORT", sourceId: "report-1", sourceNo: null },
    ]);
    db.branchPulloutAttachment.findMany.mockResolvedValue([
      { id: "att-1", pulloutId: "pullout-1", fileName: "waybill.pdf" },
    ]);
    db.branchDefectReportPhoto.findMany.mockResolvedValue([
      {
        id: "photo-1",
        reportId: "report-1",
        fileName: "crack a.png",
        storagePath: "defect-report-photos/tenants/t1/a b.png",
      },
    ]);

    const { items } = await inventoryApprovalRepository.list("t1", {});

    expect(db.branchPulloutAttachment.findMany.mock.calls[0][0].where).toEqual({
      pulloutId: { in: ["pullout-1"] },
      pullout: { tenantId: "t1" },
    });
    expect(db.branchDefectReportPhoto.findMany.mock.calls[0][0].where).toEqual({
      reportId: { in: ["report-1"] },
      report: { tenantId: "t1" },
    });
    expect(items[0].attachments).toEqual([
      { id: "att-1", name: "waybill.pdf", href: "/api/logistics/pullout-attachments/att-1" },
    ]);
    expect(items[1].attachments).toEqual([
      {
        id: "photo-1",
        name: "crack a.png",
        href: "/api/inventory/defect-photos?path=defect-report-photos%2Ftenants%2Ft1%2Fa%20b.png",
      },
    ]);
  });

  it("skips the file lookups when no row can have files", async () => {
    db.inventoryApproval.findMany.mockResolvedValue([{ ...row, sourceType: "TRANSFER" }]);

    await inventoryApprovalRepository.list("t1", {});

    expect(db.branchPulloutAttachment.findMany).not.toHaveBeenCalled();
    expect(db.branchDefectReportPhoto.findMany).not.toHaveBeenCalled();
  });
});
