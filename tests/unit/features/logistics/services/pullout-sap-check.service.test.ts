jest.mock("@/lib/database/client", () => {
  const tx = {
    branchPulloutLine: { updateMany: jest.fn() },
    branchInventory: { updateMany: jest.fn() },
    branchPullout: { updateMany: jest.fn() },
    branchDelivery: { create: jest.fn() },
    branchDeliveryLine: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    serialNumber: { updateMany: jest.fn() },
    deliverySapDocument: { upsert: jest.fn() },
    auditLog: { create: jest.fn(), createMany: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchPullout: { findFirst: jest.fn() },
      branchInventory: { findMany: jest.fn() },
      branch: { findMany: jest.fn() },
      deliverySapDocument: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/storage", () => ({ buildPulloutAttachmentPath: jest.fn(), getObjectStorage: jest.fn() }));
jest.mock("@/features/inventory/services/serial-placement", () => ({ lockSerialNumbers: jest.fn() }));
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
}));
jest.mock("@/features/logistics/services/delivery-settle", () => ({
  txWorkflowCodeId: jest.fn(async () => "dlv-pending"),
}));
jest.mock("@/features/logistics/services/logistics.service", () => ({ nextDeliveryNo: () => "DLV-NEW" }));
jest.mock("@/features/logistics/services/pullout-sap-document.service", () => ({
  findPulloutSapDocuments: jest.fn(),
  findSapRedeliveries: jest.fn(),
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn(async (_t: string, _c: string, code: string) => `id-${code}`) },
}));
jest.mock("@/features/sap/services/sap-service-layer.service", () => ({
  sapServiceLayerService: { getCredentials: jest.fn() },
}));

import * as dbClient from "@/lib/database/client";
import { authorizePosting } from "@/features/logistics/services/posting-support";
import { checkPulloutInSap } from "@/features/logistics/services/pullout-sap-check.service";
import {
  findPulloutSapDocuments,
  findSapRedeliveries,
} from "@/features/logistics/services/pullout-sap-document.service";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";

type Mock = jest.Mock;
const { mockTx, prisma } = dbClient as unknown as {
  mockTx: Record<string, Record<string, Mock>>;
  prisma: Record<string, Record<string, Mock>>;
};
const findDocs = jest.mocked(findPulloutSapDocuments);
const findDrs = jest.mocked(findSapRedeliveries);
const getCredentials = jest.mocked(sapServiceLayerService.getCredentials);

const actor = { tenantId: "t1", userId: "u1", roleSlugs: [], permissions: ["logistics.manage"] };

function line(serialNumberId: string, overrides: Record<string, unknown> = {}) {
  return {
    serialNumberId,
    sapDocType: null,
    sapDocEntry: null,
    redeliveryDeliveryId: null,
    receivedAt: null,
    rejectedAt: null,
    serialNumber: { serialNo: serialNumberId.toUpperCase() },
    ...overrides,
  };
}

function pullout(status = "in_transit", lines = [line("s1"), line("s2")]) {
  return { id: "p1", pulloutNo: "PLT-1", branchId: "b1", statusCodeId: "st", statusCode: { code: status }, lines };
}

const returnDoc = {
  type: "RETURN" as const,
  docEntry: 12668,
  docNum: 12631,
  docDate: "2026-11-12",
  cancelled: false,
  lines: [{ pulloutRef: "PLT-1", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1", "S2"] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  getCredentials.mockResolvedValue({} as never);
  prisma.branchPullout.findFirst.mockResolvedValue(pullout());
  prisma.branchInventory.findMany.mockResolvedValue([
    { serialNumberId: "s1", statusCode: { code: "DIT" } },
    { serialNumberId: "s2", statusCode: { code: "DIT" } },
  ]);
  prisma.branch.findMany.mockResolvedValue([]);
  prisma.deliverySapDocument.findMany.mockResolvedValue([]);
  findDocs.mockResolvedValue([returnDoc]);
  findDrs.mockResolvedValue([]);
  mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 2 });
  mockTx.branchInventory.updateMany.mockResolvedValue({ count: 2 });
  mockTx.branchPullout.updateMany.mockResolvedValue({ count: 1 });
  mockTx.branchDelivery.create.mockResolvedValue({ id: "d1", deliveryNo: "DLV-NEW" });
});

describe("Check SAP on a pull-out", () => {
  it("links the Return, moves DIT units to PO and ends the pull-out at Pulled out", async () => {
    const result = await checkPulloutInSap(actor, "p1");

    expect(authorizePosting).toHaveBeenCalledWith(actor, "pullout.checkSap", "b1");
    expect(findDocs).toHaveBeenCalledWith({}, "PLT-1");
    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1", "s2"] }, sapDocType: null },
      data: expect.objectContaining({ sapDocType: "RETURN", sapDocEntry: 12668, sapDocNum: 12631 }),
    });
    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "b1", statusCodeId: "id-DIT" }),
        data: expect.objectContaining({ statusCodeId: "id-PO" }),
      }),
    );
    expect(mockTx.branchPullout.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1", statusCodeId: { in: ["id-in_transit"] } },
      data: { statusCodeId: "id-pulled_out" },
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data.action).toBe("pullout.pulled_out");
    // Units become PO in this check, so SAP is asked for DRs copied from the Return.
    expect(findDrs).toHaveBeenCalledWith({}, "PLT-1", [12668]);
    expect(result).toMatchObject({
      linkedDocuments: ["Return: 12631"],
      linkedCount: 2,
      pulledOutCount: 2,
      waitingCount: 0,
      redeliveries: [],
    });
  });

  it("keeps the pull-out in transit while some units are not in SAP", async () => {
    findDocs.mockResolvedValue([{ ...returnDoc, lines: [{ ...returnDoc.lines[0], serialNos: ["S1"] }] }]);
    mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 1 });
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });

    const result = await checkPulloutInSap(actor, "p1");

    expect(mockTx.branchPullout.updateMany).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create.mock.calls[0][0].data.action).toBe("pullout.sap_checked");
    expect(result.waitingCount).toBe(1);
  });

  it("redelivers a pulled-out unit on a DR copied from its Return", async () => {
    prisma.branchPullout.findFirst.mockResolvedValue(
      pullout("pulled_out", [
        line("s1", { sapDocType: "RETURN", sapDocEntry: 12668 }),
        line("s2", { sapDocType: "RETURN", sapDocEntry: 12668 }),
      ]),
    );
    prisma.branchInventory.findMany.mockResolvedValue([
      { serialNumberId: "s1", statusCode: { code: "PO" } },
      { serialNumberId: "s2", statusCode: { code: "PO" } },
    ]);
    findDocs.mockResolvedValue([returnDoc]);
    findDrs.mockResolvedValue([
      {
        docEntry: 166992,
        docNum: 168206,
        displayNo: "168206",
        docDate: "2026-11-13",
        cancelled: false,
        lines: [{ pulloutRef: "", baseType: 16, baseEntry: 12668, branchCode: "", serialNos: ["S1"] }],
      },
    ]);
    mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 1 });
    mockTx.branchInventory.updateMany.mockResolvedValue({ count: 1 });

    const result = await checkPulloutInSap(actor, "p1");

    expect(mockTx.branchDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: "b1", statusCodeId: "dlv-pending", sapDocEntry: 166992, drNo: "168206" }),
      select: { id: true, deliveryNo: true },
    });
    expect(mockTx.branchInventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ serialNumberId: { in: ["s1"] }, statusCodeId: "id-PO" }),
        data: expect.objectContaining({ statusCodeId: "id-DIT" }),
      }),
    );
    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1"] }, redeliveryDeliveryId: null },
      data: { redeliveryDeliveryId: "d1" },
    });
    expect(mockTx.deliverySapDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_docKind_docEntry: { tenantId: "t1", docKind: "DR", docEntry: 166992 } },
      }),
    );
    expect(result.redeliveries).toEqual([{ deliveryNo: "DLV-NEW", drNo: "168206", unitCount: 1 }]);
  });

  it("does not re-apply a DR another delivery already applied", async () => {
    prisma.branchInventory.findMany.mockResolvedValue([
      { serialNumberId: "s1", statusCode: { code: "PO" } },
      { serialNumberId: "s2", statusCode: { code: "PO" } },
    ]);
    prisma.branchPullout.findFirst.mockResolvedValue(
      pullout("pulled_out", [line("s1", { sapDocType: "RETURN", sapDocEntry: 12668 }), line("s2", { sapDocType: "RETURN", sapDocEntry: 12668 })]),
    );
    findDrs.mockResolvedValue([
      {
        docEntry: 166992,
        docNum: 168206,
        displayNo: "168206",
        docDate: null,
        cancelled: false,
        lines: [{ pulloutRef: "PLT-1", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1"] }],
      },
    ]);
    prisma.deliverySapDocument.findMany.mockResolvedValue([{ docEntry: 166992 }]);

    const result = await checkPulloutInSap(actor, "p1");

    expect(mockTx.branchDelivery.create).not.toHaveBeenCalled();
    expect(result.redeliveries).toEqual([]);
  });

  it("refuses before the pull-out is sent, and without SAP", async () => {
    prisma.branchPullout.findFirst.mockResolvedValue(pullout("pending_logistics"));
    await expect(checkPulloutInSap(actor, "p1")).rejects.toThrow("Check SAP only after the pull-out is sent");

    prisma.branchPullout.findFirst.mockResolvedValue(pullout());
    getCredentials.mockResolvedValue(null as never);
    await expect(checkPulloutInSap(actor, "p1")).rejects.toThrow(/SAP is not connected/);
    expect(findDocs).not.toHaveBeenCalled();
  });
});
