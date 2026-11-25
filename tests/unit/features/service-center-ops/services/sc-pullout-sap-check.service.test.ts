jest.mock("@/lib/database/client", () => {
  const tx = {
    serviceCenterPulloutDetail: { updateMany: jest.fn() },
    serviceCenterInventory: { updateMany: jest.fn(), findMany: jest.fn() },
    serviceCenterPullout: { updateMany: jest.fn() },
    serviceCenterDelivery: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    serviceCenterDeliveryLine: { createMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    serialNumber: { updateMany: jest.fn() },
    auditLog: { create: jest.fn(), createMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  return {
    mockTx: tx,
    prisma: {
      serviceCenterPullout: { findFirst: jest.fn() },
      serviceCenterInventory: { findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/storage", () => ({ buildPulloutAttachmentPath: jest.fn(), getObjectStorage: jest.fn() }));
jest.mock("@/features/inventory/services/serial-placement", () => ({ lockSerialNumbers: jest.fn() }));
jest.mock("@/features/service-center-ops/services/sc-scope", () => ({
  resolveScIdsForUser: jest.fn(async () => null),
  assertScInScope: jest.fn(),
}));
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
import {
  findPulloutSapDocuments,
  findSapRedeliveries,
} from "@/features/logistics/services/pullout-sap-document.service";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { checkScPulloutInSap } from "@/features/service-center-ops/services/sc-pullout-sap-check.service";
import { assertScInScope } from "@/features/service-center-ops/services/sc-scope";

type Mock = jest.Mock;
const { mockTx, prisma } = dbClient as unknown as {
  mockTx: Record<string, Record<string, Mock>>;
  prisma: Record<string, Record<string, Mock>>;
};
const findDocs = jest.mocked(findPulloutSapDocuments);
const findDrs = jest.mocked(findSapRedeliveries);
const getCredentials = jest.mocked(sapServiceLayerService.getCredentials);

const actor = { tenantId: "t1", userId: "u1", roleSlugs: [], permissions: ["service_centers.logistics.manage"] };

function detail(serialNumberId: string, overrides: Record<string, unknown> = {}) {
  return {
    serialNumberId,
    sapDocType: null,
    sapDocEntry: null,
    redeliveryDeliveryId: null,
    serialNumber: { serialNo: serialNumberId.toUpperCase() },
    ...overrides,
  };
}

function pullout(status = "in_transit", details = [detail("s1"), detail("s2")]) {
  return {
    id: "p1",
    pulloutNo: "SCP-1",
    serviceCenterId: "sc1",
    serviceCenter: { name: "SC Cebu", sapCode: "SC001" },
    statusCode: { code: status },
    details,
  };
}

const returnDoc = {
  type: "RETURN" as const,
  docEntry: 12668,
  docNum: 12631,
  docDate: "2026-11-12",
  cancelled: false,
  closed: false,
  lines: [{ pulloutRef: "SCP-1", baseType: null, baseEntry: null, branchCode: "", serialNos: ["S1", "S2"] }],
};

function redeliveryDr(branchCode: string) {
  return {
    docEntry: 166992,
    docNum: 168206,
    displayNo: "168206",
    docDate: "2026-11-13",
    cancelled: false,
    lines: [{ pulloutRef: "", baseType: 16, baseEntry: 12668, branchCode, serialNos: ["S1"] }],
  };
}

function pulledOut() {
  prisma.serviceCenterPullout.findFirst.mockResolvedValue(
    pullout("pulled_out", [
      detail("s1", { sapDocType: "RETURN", sapDocEntry: 12668 }),
      detail("s2", { sapDocType: "RETURN", sapDocEntry: 12668 }),
    ]),
  );
  prisma.serviceCenterInventory.findMany.mockResolvedValue([
    { serialNumberId: "s1", statusCode: { code: "PO" } },
    { serialNumberId: "s2", statusCode: { code: "PO" } },
  ]);
  mockTx.serviceCenterPulloutDetail.updateMany.mockResolvedValue({ count: 1 });
  mockTx.serviceCenterInventory.updateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  getCredentials.mockResolvedValue({} as never);
  prisma.serviceCenterPullout.findFirst.mockResolvedValue(pullout());
  prisma.serviceCenterInventory.findMany.mockResolvedValue([
    { serialNumberId: "s1", statusCode: { code: "DIT" } },
    { serialNumberId: "s2", statusCode: { code: "DIT" } },
  ]);
  findDocs.mockResolvedValue([returnDoc]);
  findDrs.mockResolvedValue([]);
  mockTx.serviceCenterPulloutDetail.updateMany.mockResolvedValue({ count: 2 });
  mockTx.serviceCenterInventory.updateMany.mockResolvedValue({ count: 2 });
  mockTx.serviceCenterInventory.findMany.mockResolvedValue([{ serviceCenterLocationId: "loc1" }]);
  mockTx.serviceCenterPullout.updateMany.mockResolvedValue({ count: 1 });
  mockTx.serviceCenterDelivery.findFirst.mockResolvedValue(null);
  mockTx.serviceCenterDelivery.create.mockResolvedValue({
    id: "d1",
    deliveryNo: "SCD-DR166992",
    serviceCenterId: "sc1",
    statusCodeId: "id-pending",
  });
});

describe("Check SAP on a service center pull-out", () => {
  it("links the Return, moves DIT units to PO on the SC ledger and ends at Pulled out", async () => {
    const result = await checkScPulloutInSap(actor, "p1");

    expect(assertScInScope).toHaveBeenCalledWith("sc1", null);
    expect(findDocs).toHaveBeenCalledWith({}, "SCP-1");
    expect(mockTx.serviceCenterPulloutDetail.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1", "s2"] }, sapDocType: null },
      data: expect.objectContaining({ sapDocType: "RETURN", sapDocEntry: 12668, sapDocNum: 12631 }),
    });
    expect(mockTx.serviceCenterInventory.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        serviceCenterId: "sc1",
        serialNumberId: { in: ["s1", "s2"] },
        statusCodeId: "id-DIT",
      },
      data: { statusCodeId: "id-PO" },
    });
    expect(mockTx.serviceCenterPullout.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: "t1", statusCodeId: { in: ["id-in_transit"] } },
      data: { statusCodeId: "id-pulled_out" },
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "pullout.pulled_out",
      entityType: "ServiceCenterPullout",
    });
    expect(findDrs).toHaveBeenCalledWith({}, "SCP-1", [12668]);
    expect(result).toMatchObject({ linkedDocuments: ["Return: 12631"], pulledOutCount: 2, waitingCount: 0 });
  });

  it("keeps the pull-out in transit while some units are not in SAP", async () => {
    findDocs.mockResolvedValue([{ ...returnDoc, lines: [{ ...returnDoc.lines[0], serialNos: ["S1"] }] }]);
    mockTx.serviceCenterPulloutDetail.updateMany.mockResolvedValue({ count: 1 });
    mockTx.serviceCenterInventory.updateMany.mockResolvedValue({ count: 1 });

    const result = await checkScPulloutInSap(actor, "p1");

    expect(mockTx.serviceCenterPullout.updateMany).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create.mock.calls[0][0].data.action).toBe("pullout.sap_checked");
    expect(result.waitingCount).toBe(1);
  });

  it("redelivers a pulled-out unit back to the center as an SC delivery", async () => {
    pulledOut();
    findDrs.mockResolvedValue([redeliveryDr("")]);

    const result = await checkScPulloutInSap(actor, "p1");

    expect(mockTx.serviceCenterDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceCenterId: "sc1",
        serviceCenterLocationId: "loc1",
        deliveryNo: "SCD-DR166992",
        statusCodeId: "id-pending",
        sapDocEntry: 166992,
        sapDocNo: "168206",
      }),
      select: expect.any(Object),
    });
    expect(mockTx.serviceCenterDeliveryLine.createMany).toHaveBeenCalledWith({
      data: [{ deliveryId: "d1", serialNumberId: "s1" }],
      skipDuplicates: true,
    });
    expect(mockTx.serviceCenterInventory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ serialNumberId: { in: ["s1"] }, statusCodeId: "id-PO" }),
        data: { statusCodeId: "id-DIT" },
      }),
    );
    expect(mockTx.serviceCenterPulloutDetail.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1"] }, redeliveryDeliveryId: null },
      data: { redeliveryDeliveryId: "d1" },
    });
    expect(result.redeliveries).toEqual([{ deliveryNo: "SCD-DR166992", drNo: "168206", unitCount: 1 }]);
  });

  it("adds to the SC delivery a DR already made, reopening it if fully accepted", async () => {
    pulledOut();
    findDrs.mockResolvedValue([redeliveryDr("SC001")]);
    mockTx.serviceCenterDelivery.findFirst.mockResolvedValue({
      id: "d0",
      deliveryNo: "SCD-DR166992",
      serviceCenterId: "sc1",
      statusCodeId: "id-accepted",
    });

    const result = await checkScPulloutInSap(actor, "p1");

    expect(mockTx.serviceCenterDelivery.create).not.toHaveBeenCalled();
    expect(mockTx.serviceCenterDeliveryLine.createMany).toHaveBeenCalledWith({
      data: [{ deliveryId: "d0", serialNumberId: "s1" }],
      skipDuplicates: true,
    });
    expect(mockTx.serviceCenterDelivery.update).toHaveBeenCalledWith({
      where: { id: "d0" },
      data: { statusCodeId: "id-partial" },
    });
    expect(result.redeliveries).toHaveLength(1);
  });

  it("reports a DR to another place instead of applying it", async () => {
    pulledOut();
    findDrs.mockResolvedValue([redeliveryDr("B002")]);

    const result = await checkScPulloutInSap(actor, "p1");

    expect(mockTx.serviceCenterDelivery.create).not.toHaveBeenCalled();
    expect(result.redeliveries).toEqual([]);
    expect(result.notes).toEqual([
      'DR 168206: it delivers to "B002", not back to SC Cebu, so ISMS did not follow it',
    ]);
  });

  it("refuses before the pull-out is sent, and without SAP", async () => {
    prisma.serviceCenterPullout.findFirst.mockResolvedValue(pullout("pending_logistics"));
    await expect(checkScPulloutInSap(actor, "p1")).rejects.toThrow("Check SAP only after the pull-out is sent");

    prisma.serviceCenterPullout.findFirst.mockResolvedValue(pullout());
    getCredentials.mockResolvedValue(null as never);
    await expect(checkScPulloutInSap(actor, "p1")).rejects.toThrow(/SAP is not connected/);
    expect(findDocs).not.toHaveBeenCalled();
  });

  it("needs SC logistics manage", async () => {
    await expect(checkScPulloutInSap({ ...actor, permissions: [] }, "p1")).rejects.toThrow(/permission/);
  });
});
