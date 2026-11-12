jest.mock("@/lib/database/client", () => {
  const tx = {
    branchPulloutLine: { updateMany: jest.fn() },
    serialNumberHistory: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  return {
    mockTx: tx,
    prisma: {
      branchPullout: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/storage", () => ({
  buildPulloutAttachmentPath: jest.fn(),
  getObjectStorage: jest.fn(),
}));
jest.mock("@/features/logistics/services/posting-support", () => ({
  ...jest.requireActual("@/features/logistics/services/posting-support"),
  authorizePosting: jest.fn(),
}));
jest.mock("@/features/logistics/services/pullout-sap-document.service", () => ({
  fetchPulloutSapDocument: jest.fn(),
}));

import * as dbClient from "@/lib/database/client";
import { authorizePosting } from "@/features/logistics/services/posting-support";
import { pulloutPostingService } from "@/features/logistics/services/pullout-posting.service";
import { fetchPulloutSapDocument } from "@/features/logistics/services/pullout-sap-document.service";

const { mockTx, prisma } = dbClient as unknown as {
  mockTx: {
    branchPulloutLine: { updateMany: jest.Mock };
    serialNumberHistory: { createMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  prisma: { branchPullout: { findFirst: jest.Mock } };
};
const fetchDoc = jest.mocked(fetchPulloutSapDocument);

const actor = { tenantId: "t1", userId: "u1", roleSlugs: [], permissions: ["logistics.manage"] };

function pullout(status = "in_transit", sapDoc: { sapDocType: "IT" | "RETURN"; sapDocNum: number } | null = null) {
  return {
    id: "p1",
    pulloutNo: "PLT-1",
    branchId: "b1",
    statusCode: { code: status },
    lines: [
      { serialNumberId: "s1", sapDocType: sapDoc?.sapDocType ?? null, sapDocNum: sapDoc?.sapDocNum ?? null, serialNumber: { serialNo: "SN-1" } },
      { serialNumberId: "s2", sapDocType: null, sapDocNum: null, serialNumber: { serialNo: "SN-2" } },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.branchPullout.findFirst.mockResolvedValue(pullout());
  mockTx.branchPulloutLine.updateMany.mockResolvedValue({ count: 2 });
  fetchDoc.mockResolvedValue({
    type: "IT",
    docEntry: 77,
    docNum: 494405,
    docDate: "2026-11-12",
    cancelled: false,
    serialNos: ["SN-1", "SN-2", "SN-OTHER-PULLOUT"],
  });
});

describe("linking a sent pull-out to its SAP document", () => {
  it("stores the checked document on each selected unit", async () => {
    const result = await pulloutPostingService.linkSapDocument(actor, "p1", {
      serialNumberIds: ["s1", "s2"],
      docType: "IT",
      docNum: 494405,
    });

    expect(authorizePosting).toHaveBeenCalledWith(actor, "pullout.linkSapDocument", "b1");
    expect(fetchDoc).toHaveBeenCalledWith("t1", "IT", 494405);
    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: { in: ["s1", "s2"] } },
      data: expect.objectContaining({
        sapDocType: "IT",
        sapDocEntry: 77,
        sapDocNum: 494405,
        sapDocDate: new Date("2026-11-12T00:00:00.000Z"),
        sapDocLinkedById: "u1",
      }),
    });
    expect(mockTx.serialNumberHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      serialNumberId: "s1",
      status: null,
      details: "SAP IT: 494405 linked on PLT-1",
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "pullout.sap_document_linked",
      entityId: "p1",
    });
    expect(result).toEqual({ id: "p1", label: "IT: 494405", linkedCount: 2 });
  });

  it("refuses before the pull-out is sent", async () => {
    prisma.branchPullout.findFirst.mockResolvedValue(pullout("pending_logistics"));

    await expect(
      pulloutPostingService.linkSapDocument(actor, "p1", {
        serialNumberIds: ["s1"],
        docType: "IT",
        docNum: 1,
      }),
    ).rejects.toThrow("Link SAP documents only after the pull-out is sent");
    expect(fetchDoc).not.toHaveBeenCalled();
  });

  it("refuses a unit that is not on this pull-out", async () => {
    await expect(
      pulloutPostingService.linkSapDocument(actor, "p1", {
        serialNumberIds: ["s9"],
        docType: "IT",
        docNum: 1,
      }),
    ).rejects.toThrow("One or more units are not on this pull-out");
  });

  it("saves nothing when SAP's document does not list a selected serial", async () => {
    fetchDoc.mockResolvedValue({
      type: "RETURN",
      docEntry: 5,
      docNum: 14402,
      docDate: null,
      cancelled: false,
      serialNos: ["SN-1"],
    });

    await expect(
      pulloutPostingService.linkSapDocument(actor, "p1", {
        serialNumberIds: ["s1", "s2"],
        docType: "RETURN",
        docNum: 14402,
      }),
    ).rejects.toThrow("Return: 14402 in SAP does not list SN-2");
    expect(mockTx.branchPulloutLine.updateMany).not.toHaveBeenCalled();
  });

  it("clears one unit's link and records it", async () => {
    prisma.branchPullout.findFirst.mockResolvedValue(pullout("in_transit", { sapDocType: "IT", sapDocNum: 12 }));

    await pulloutPostingService.unlinkSapDocument(actor, "p1", "s1");

    expect(mockTx.branchPulloutLine.updateMany).toHaveBeenCalledWith({
      where: { pulloutId: "p1", serialNumberId: "s1" },
      data: expect.objectContaining({ sapDocType: null, sapDocNum: null, sapDocLinkedById: null }),
    });
    expect(mockTx.auditLog.create.mock.calls[0][0].data.action).toBe("pullout.sap_document_unlinked");
  });

  it("treats unlinking a unit with no link as done", async () => {
    await expect(pulloutPostingService.unlinkSapDocument(actor, "p1", "s2")).resolves.toEqual({
      id: "p1",
      idempotent: true,
    });
    expect(mockTx.branchPulloutLine.updateMany).not.toHaveBeenCalled();
  });
});
