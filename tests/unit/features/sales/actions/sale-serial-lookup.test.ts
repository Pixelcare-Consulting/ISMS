jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
  requirePermission: jest.fn(),
  requireAnyPermission: jest.fn(),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    alternateWarehouse: { findFirst: jest.fn() },
    branchInventory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    branchReturnRequest: { findFirst: jest.fn() },
    branchSalesTransaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branchSalesTransactionDetail: {
      create: jest.fn(),
      update: jest.fn(),
    },
    brand: { findMany: jest.fn() },
    customerDeliveryMethod: { findFirst: jest.fn() },
    packageType: { findMany: jest.fn() },
    paymentType: { findFirst: jest.fn() },
    promoType: { findMany: jest.fn() },
    saleType: { findFirst: jest.fn() },
    stockCountLine: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: {
    findCodeId: jest.fn(async () => ({ id: "FW-id" })),
  },
}));

jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: {
    requireCodeId: jest.fn(
      async (_tenantId: string, _category: string, code: string) => `${code}-id`,
    ),
  },
}));

jest.mock("@/features/sales/services/model-price", () => ({
  resolveModelPriceForSales: jest.fn(async () => ({ amount: 1500 })),
}));

jest.mock("@/features/sales/services/atr-odrf-pdf", () => ({
  generateAndStoreAtrOdrfPdf: jest.fn(),
}));

jest.mock("@/features/sales/repositories/sales.repository", () => ({
  salesRepository: {},
}));

jest.mock("@/features/sales/services/sales-kpi.service", () => ({
  salesKpiService: {},
}));

import { aorService } from "@/features/aors/services/aor.service";
import { SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP } from "@/features/inventory/services/inventory-serial-moves";
import { TO_FOLLOW_SERIAL_ID } from "@/features/sales/constants/to-follow-serial";
import {
  completeReplacementSameInvoiceAction,
  createSaleAction,
  listSaleableSerialsAction,
  updateSaleSerialAction,
} from "@/features/sales/actions/sales.actions";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const requirePermissionMock = requirePermission as jest.Mock;
const requireAnyPermissionMock = requireAnyPermission as jest.Mock;
const branchIdsForUser = aorService.getBranchIdsForUser as jest.Mock;
const inventoryFindFirst = prisma.branchInventory.findFirst as jest.Mock;
const inventoryFindMany = prisma.branchInventory.findMany as jest.Mock;
const inventoryCount = prisma.branchInventory.count as jest.Mock;
const inventoryUpdateMany = prisma.branchInventory.updateMany as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const managerSession = {
  user: {
    id: "user-1",
    tenantId: "tenant-1",
    permissions: ["sales.create", "branches.manage"],
  },
};

function line(serialNumberId: string, modelId = "model-1") {
  return {
    packageTypeId: "pkg-1",
    brandId: "brand-1",
    modelId,
    serialNumberId,
    saleAmount: 1000,
  };
}

function saleInput(
  details: Array<ReturnType<typeof line>>,
  extra?: { branchId?: string; alternateBranchId?: string },
) {
  return {
    transactionNo: "TRN-1001",
    branchId: extra?.branchId ?? "branch-1",
    alternateBranchId: extra?.alternateBranchId ?? "branch-1",
    customerName: "Ada",
    paymentTypeId: "pay-1",
    saleTypeId: "type-1",
    customerDeliveryMethodId: "cdm-1",
    details,
  };
}

function sellableRow(modelId = "model-1", serialNo = "SN-100") {
  return {
    statusCodeId: "STK-id",
    statusCode: { code: "STK" },
    serialNumber: { serialNo, modelId },
    defectReports: [] as Array<{ id: string }>,
  };
}

function toFollowSale() {
  return {
    id: "sale-1",
    transactionNo: "TRN-1001",
    branchId: "branch-1",
    alternateBranchId: "branch-1",
    customerDeliveryMethod: { name: "PICKUP" },
    details: [
      {
        id: "detail-1",
        modelId: "model-1",
        serialNumberId: null,
        deliveryNo: null,
        deliveryDate: null,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  requirePermissionMock.mockResolvedValue(managerSession);
  requireAnyPermissionMock.mockResolvedValue(managerSession);
  branchIdsForUser.mockResolvedValue(["branch-1"]);
  transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  (prisma.branchSalesTransaction.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.branchSalesTransaction.create as jest.Mock).mockResolvedValue({
    id: "sale-1",
    transactionNo: "TRN-1001",
  });
  (prisma.branchSalesTransactionDetail.create as jest.Mock).mockResolvedValue({
    id: "detail-1",
  });
  (prisma.branchSalesTransactionDetail.update as jest.Mock).mockResolvedValue({
    id: "detail-1",
  });
  (prisma.packageType.findMany as jest.Mock).mockResolvedValue([{ id: "pkg-1" }]);
  (prisma.brand.findMany as jest.Mock).mockResolvedValue([{ id: "brand-1" }]);
  (prisma.paymentType.findFirst as jest.Mock).mockResolvedValue({ id: "pay-1" });
  (prisma.saleType.findFirst as jest.Mock).mockResolvedValue({ id: "type-1" });
  (prisma.customerDeliveryMethod.findFirst as jest.Mock).mockResolvedValue({
    id: "cdm-1",
    name: "PICKUP",
  });
  (prisma.alternateWarehouse.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.stockCountLine.findFirst as jest.Mock).mockResolvedValue(null);
  inventoryFindFirst.mockResolvedValue(null);
  inventoryUpdateMany.mockResolvedValue({ count: 1 });
  inventoryCount.mockResolvedValue(0);
  inventoryFindMany.mockResolvedValue([]);
});

describe("listSaleableSerialsAction", () => {
  it("returns an empty page and does not query inventory when modelId is missing", async () => {
    const result = await listSaleableSerialsAction({
      branchId: "branch-1",
      limit: 500,
    });

    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 1,
    });
    expect(inventoryCount).not.toHaveBeenCalled();
    expect(inventoryFindMany).not.toHaveBeenCalled();
  });

  it("rejects a stock source outside the user's area before querying inventory", async () => {
    requirePermissionMock.mockResolvedValue({
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        permissions: ["sales.create"],
      },
    });

    await expect(
      listSaleableSerialsAction({
        branchId: "source-9",
        modelId: "model-1",
      }),
    ).rejects.toThrow("Branch not in your area of responsibility");

    expect(inventoryCount).not.toHaveBeenCalled();
    expect(inventoryFindMany).not.toHaveBeenCalled();
  });

  it("searches by serial in the database and caps the page below the old 500 cutoff", async () => {
    inventoryCount.mockResolvedValue(1);
    inventoryFindMany.mockResolvedValue([
      {
        serialNumber: {
          id: "sn-late",
          serialNo: "ZZZ-99999",
          modelId: "model-1",
          model: { skuCode: "SKU-1", name: "Model One" },
        },
      },
    ]);

    const result = await listSaleableSerialsAction({
      branchId: "branch-1",
      modelId: "model-1",
      search: "ZZZ-99999",
    });

    const findArgs = inventoryFindMany.mock.calls[0][0] as {
      where: {
        tenantId: string;
        branchId: string;
        statusCodeId: string;
        serialNumber: {
          modelId: string;
          serialNo: { contains: string; mode: string };
        };
      };
      skip: number;
      take: number;
      orderBy: unknown;
    };

    expect(findArgs.where).toMatchObject({
      tenantId: "tenant-1",
      branchId: "branch-1",
      statusCodeId: "STK-id",
      serialNumber: {
        modelId: "model-1",
        serialNo: { contains: "ZZZ-99999", mode: "insensitive" },
      },
    });
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(25);
    expect(findArgs.orderBy).toEqual([
      { serialNumber: { serialNo: "asc" } },
      { id: "asc" },
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({ id: "sn-late", serialNo: "ZZZ-99999" }),
    ]);
  });
});

describe("createSaleAction serial guards", () => {
  it("rejects duplicate serials in one sale before moving stock", async () => {
    const result = await createSaleAction(
      saleInput([line("sn-1"), line("sn-1")]),
    );

    expect(result).toEqual({
      error: "Duplicate serials in the same transaction are not allowed",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(inventoryUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a stock source that is not the sold branch or its alternate", async () => {
    const result = await createSaleAction(
      saleInput([line("sn-1")], {
        branchId: "branch-1",
        alternateBranchId: "source-9",
      }),
    );

    expect(result).toEqual({
      error: "Stock source must be the sold branch or one of its alternate branches",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(inventoryFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a unit that is not at the stock source", async () => {
    const result = await createSaleAction(saleInput([line("sn-missing")]));

    expect(result).toEqual({
      error: "Serial is not in sellable stock at the stock source branch",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a unit that is not STK", async () => {
    inventoryFindFirst.mockResolvedValue({
      statusCodeId: "SLD-id",
      statusCode: { code: "SLD" },
      serialNumber: { serialNo: "SN-SOLD", modelId: "model-1" },
      defectReports: [],
    });

    const result = await createSaleAction(saleInput([line("sn-sold")]));

    expect(result).toEqual({
      error: "SN-SOLD is not in sellable stock at the stock source branch",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a pending defect inspection", async () => {
    inventoryFindFirst.mockResolvedValue({
      ...sellableRow("model-1", "SN-HOLD"),
      defectReports: [{ id: "report-1" }],
    });

    const result = await createSaleAction(saleInput([line("sn-hold")]));

    expect(result).toEqual({
      error: "SN-HOLD is pending defect inspection and cannot be sold or reserved",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a serial that does not match the selected model", async () => {
    inventoryFindFirst.mockResolvedValue(sellableRow("other-model", "SN-9"));

    const result = await createSaleAction(saleInput([line("sn-9", "model-1")]));

    expect(result).toEqual({
      error: "SN-9 does not match the selected model",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(inventoryUpdateMany).not.toHaveBeenCalled();
  });

  it("does not move stock when the line is TO-FOLLOW", async () => {
    const result = await createSaleAction(
      saleInput([line(TO_FOLLOW_SERIAL_ID), line(TO_FOLLOW_SERIAL_ID)]),
    );

    expect(result).toEqual({ success: true });
    expect(inventoryUpdateMany).not.toHaveBeenCalled();
    expect(inventoryFindFirst).not.toHaveBeenCalled();
    expect(prisma.branchSalesTransactionDetail.create).toHaveBeenCalledTimes(2);
    expect(prisma.branchSalesTransactionDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serialNumberId: null }),
      }),
    );
  });

  it("returns the conflict message when the conditional STK update matches zero rows", async () => {
    inventoryFindFirst.mockResolvedValue(sellableRow());
    inventoryUpdateMany.mockResolvedValue({ count: 0 });

    const result = await createSaleAction(saleInput([line("sn-1")]));

    expect(result).toEqual({ error: SERIAL_SOLD_OR_RESERVED_AFTER_LOOKUP });
    expect(inventoryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          serialNumberId: "sn-1",
          branchId: "branch-1",
          statusCodeId: "STK-id",
        }),
      }),
    );
  });
});

describe("updateSaleSerialAction", () => {
  it("edits only a TO-FOLLOW line", async () => {
    (prisma.branchSalesTransaction.findFirst as jest.Mock).mockResolvedValue({
      ...toFollowSale(),
      details: [
        {
          ...toFollowSale().details[0],
          serialNumberId: "sn-existing",
        },
      ],
    });

    const result = await updateSaleSerialAction({
      saleId: "sale-1",
      detailId: "detail-1",
      serialNumberId: "sn-new",
    });

    expect(result).toEqual({ error: "Only TO-FOLLOW sale lines can be edited" });
    expect(inventoryFindFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("assigns only an eligible STK unit and does not list a sold unit as assignable", async () => {
    (prisma.branchSalesTransaction.findFirst as jest.Mock).mockResolvedValue(
      toFollowSale(),
    );
    inventoryFindFirst.mockResolvedValue({
      statusCodeId: "SLD-id",
      statusCode: { code: "SLD" },
      serialNumber: { serialNo: "SN-SOLD", modelId: "model-1" },
      defectReports: [],
    });

    const sold = await updateSaleSerialAction({
      saleId: "sale-1",
      detailId: "detail-1",
      serialNumberId: "sn-sold",
    });

    expect(sold).toEqual({
      error: "SN-SOLD is not in sellable stock at the stock source branch",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(prisma.branchSalesTransactionDetail.update).not.toHaveBeenCalled();

    inventoryFindFirst.mockResolvedValue(sellableRow("model-1", "SN-100"));
    const assigned = await updateSaleSerialAction({
      saleId: "sale-1",
      detailId: "detail-1",
      serialNumberId: "sn-1",
    });

    expect(assigned).toEqual({ success: true });
    expect(inventoryUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ statusCodeId: "STK-id" }),
      }),
    );
    expect(prisma.branchSalesTransactionDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "detail-1" },
        data: expect.objectContaining({ serialNumberId: "sn-1" }),
      }),
    );
  });
});

describe("completeReplacementSameInvoiceAction", () => {
  it("rejects a replacement serial that does not match the selected model", async () => {
    (prisma.branchReturnRequest.findFirst as jest.Mock).mockResolvedValue({
      id: "rr-1",
      status: "approved",
      actionType: "replacement",
      stockStatusCode: "STK",
      saleDetailId: "detail-1",
      sale: {
        id: "sale-1",
        transactionNo: "TRN-1001",
        transactionDate: new Date("2026-10-01T00:00:00.000Z"),
        branchId: "branch-1",
        alternateBranchId: "branch-1",
        paymentTypeId: "pay-1",
        saleTypeId: "type-1",
        customerDeliveryMethodId: "cdm-1",
        customerName: "Ada",
        contactNo: null,
        siTrans: "TRN-1001",
        infoSlipVsoRrReleased: null,
        rrReceiveDeliver: null,
        proof: [],
        amount: 1000,
        modelPrice: 1000,
        branch: { dealerId: null },
        details: [
          {
            id: "detail-1",
            serialNumberId: "sn-old",
            modelId: "model-1",
            packageTypeId: "pkg-1",
            brandId: "brand-1",
            promoTypeId: null,
            modelPrice: 1000,
            saleAmount: 1000,
            amount: 1000,
            deliveryNo: null,
            deliveryDate: null,
            statusCodeId: "SLD-id",
          },
        ],
      },
    });
    inventoryFindFirst.mockResolvedValue({
      id: "inv-1",
      serialNumberId: "sn-new",
      statusCodeId: "STK-id",
      statusCode: { code: "STK" },
      serialNumber: {
        id: "sn-new",
        serialNo: "SN-NEW",
        modelId: "other-model",
        model: {
          id: "other-model",
          brandId: "brand-1",
          skuCode: "SKU",
          name: "Other",
        },
      },
      defectReports: [],
    });

    const result = await completeReplacementSameInvoiceAction({
      returnRequestId: "rr-1",
      modelId: "model-1",
      replacementSerialNumberId: "sn-new",
    });

    expect(result).toEqual({
      error: "SN-NEW does not match the selected model",
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(inventoryUpdateMany).not.toHaveBeenCalled();
  });
});
