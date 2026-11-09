jest.mock("@/features/competitors/repositories/competitor.repository", () => ({
  competitorRepository: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: { listByTenant: jest.fn() },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    competitor: { findFirst: jest.fn() },
    competitorBrand: { findFirst: jest.fn() },
    competitorModel: { findFirst: jest.fn() },
  },
}));

import { competitorRepository } from "@/features/competitors/repositories/competitor.repository";
import {
  COMPETITOR_REPORT_HEADERS,
  competitorService,
} from "@/features/competitors/services/competitor.service";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

const listMock = competitorRepository.list as jest.Mock;
const createMock = competitorRepository.create as jest.Mock;
const updateMock = competitorRepository.update as jest.Mock;
const findByIdMock = competitorRepository.findById as jest.Mock;
const branchIdsMock = getUserBranchIds as jest.Mock;

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "obs-1",
    competitorId: "comp-1",
    competitorName: "Acme, Inc",
    branchId: "b1",
    competitorBrandId: null,
    competitorModelId: null,
    brandName: "Brand X",
    modelName: null,
    price: 1999.5,
    promotion: null,
    notes: null,
    // 2026-11-08 23:30 UTC = 2026-11-09 in Manila.
    observedAt: new Date("2026-11-08T23:30:00.000Z"),
    createdAt: new Date("2026-11-08T23:30:00.000Z"),
    updatedAt: new Date("2026-11-08T23:30:00.000Z"),
    branch: { id: "b1", name: "SM North", sapCode: "B001" },
    competitorBrand: null,
    competitorModel: null,
    createdBy: { id: "u1", name: "Pat", email: "pat@example.com" },
    ...overrides,
  };
}

beforeEach(() => {
  (prisma.competitor.findFirst as jest.Mock).mockResolvedValue({ id: "comp-1", name: "Acme, Inc" });
});

describe("competitorService.generateReportCsv", () => {
  it("exports every observation when no dates are given", async () => {
    listMock.mockResolvedValue([observationRow()]);

    const csv = await competitorService.generateReportCsv("t1", "u1", true, {
      from: null,
      to: null,
      branchId: null,
      competitorBrandId: null,
    });

    expect(listMock).toHaveBeenCalledWith("t1", expect.objectContaining({ from: null, to: null }));
    const [header, line] = csv.split("\r\n");
    expect(header).toBe(COMPETITOR_REPORT_HEADERS.join(","));
    expect(line).toBe('2026-11-09,"Acme, Inc",SM North,B001,Brand X,,1999.5,,,Pat');
  });

  it("turns From/To days into Manila day bounds", async () => {
    listMock.mockResolvedValue([]);

    await competitorService.generateReportCsv("t1", "u1", true, {
      from: "2026-11-01",
      to: "2026-11-09",
      branchId: "b1",
      competitorBrandId: null,
    });

    expect(listMock).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        branchId: "b1",
        from: new Date("2026-10-31T16:00:00.000Z"),
        to: new Date("2026-11-09T15:59:59.999Z"),
      }),
    );
  });

  it("keeps non-managers inside their AOR", async () => {
    branchIdsMock.mockResolvedValue(["b1"]);
    listMock.mockResolvedValue([]);

    await competitorService.generateReportCsv("t1", "u1", false, {
      from: null,
      to: null,
      branchId: null,
      competitorBrandId: null,
    });

    expect(listMock).toHaveBeenCalledWith("t1", expect.objectContaining({ scopedBranchIds: ["b1"] }));
  });
});

describe("observed date is not editable", () => {
  beforeEach(() => branchIdsMock.mockResolvedValue(["b1"]));

  it("stamps the observed date on create and ignores a client value", async () => {
    createMock.mockResolvedValue(observationRow());
    const before = Date.now();

    await competitorService.create({
      tenantId: "t1",
      actorUserId: "u1",
      competitorId: "comp-1",
      price: null,
      // A stale client may still send this; it must be ignored.
      ...({ observedAt: new Date("2020-01-01") } as object),
    });

    const observedAt = createMock.mock.calls[0][1].observedAt as Date;
    expect(observedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("never writes the observed date on update", async () => {
    findByIdMock.mockResolvedValue(observationRow());
    updateMock.mockResolvedValue(observationRow());

    await competitorService.update({
      tenantId: "t1",
      actorUserId: "u1",
      id: "obs-1",
      competitorId: "comp-1",
      price: null,
      ...({ observedAt: new Date("2020-01-01") } as object),
    });

    expect(updateMock.mock.calls[0][2]).not.toHaveProperty("observedAt");
  });
});
