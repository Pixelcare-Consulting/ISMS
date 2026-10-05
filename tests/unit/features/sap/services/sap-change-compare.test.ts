import {
  compareLocations,
  compareModels,
  nextPendingSerials,
  SAP_PENDING_SERIALS_CAP,
  type IsmsLocationRow,
  type IsmsModelRow,
  type SapModelRecord,
} from "@/features/sap/services/sap-change-compare";

const deleted = new Date("2026-09-01T00:00:00Z");

describe("compareLocations", () => {
  const isms: IsmsLocationRow[] = [
    { code: "W1", name: "Main", deletedAt: null, retirable: true },
    { code: "W2", name: "North", deletedAt: deleted, retirable: true },
    { code: "W3", name: "Manual", deletedAt: null, retirable: true },
    { code: "B9", name: "Other source", deletedAt: null, retirable: false },
  ];

  it("reports nothing when SAP matches ISMS", () => {
    const result = compareLocations(
      [
        { code: "W1", name: "Main", isInactive: false },
        { code: "W2", name: "North", isInactive: true },
        { code: "W3", name: "Manual", isInactive: false },
      ],
      isms,
    );
    expect(result).toEqual({ created: [], updated: [], removed: [] });
  });

  it("reports a renamed row as updated", () => {
    const result = compareLocations(
      [
        { code: "W1", name: "Main Warehouse", isInactive: false },
        { code: "W3", name: "Manual", isInactive: false },
      ],
      isms,
    );
    expect(result.updated).toEqual(["W1"]);
  });

  it("reports a deactivated live row and a reactivated deleted row as updated", () => {
    const result = compareLocations(
      [
        { code: "W1", name: "Main", isInactive: true },
        { code: "W2", name: "North", isInactive: false },
        { code: "W3", name: "Manual", isInactive: false },
      ],
      isms,
    );
    expect(result.updated.sort()).toEqual(["W1", "W2"]);
  });

  it("reports a new active row as created, but never a new inactive one", () => {
    const result = compareLocations(
      [
        { code: "W1", name: "Main", isInactive: false },
        { code: "W3", name: "Manual", isInactive: false },
        { code: "W4", name: "New", isInactive: false },
        { code: "W5", name: "Dead", isInactive: true },
      ],
      isms,
    );
    expect(result.created).toEqual(["W4"]);
  });

  it("reports live rows SAP no longer returns as removed, within the sync's scope only", () => {
    const result = compareLocations([{ code: "W1", name: "Main", isInactive: false }], isms);
    // W2 is already deleted; B9 belongs to another sync source.
    expect(result.removed).toEqual(["W3"]);
  });

  it("reports nothing when SAP returns no rows at all", () => {
    expect(compareLocations([], isms)).toEqual({ created: [], updated: [], removed: [] });
  });

  it("keeps the first of a repeated SAP code, like the sync", () => {
    const result = compareLocations(
      [
        { code: "W1", name: "Main", isInactive: false },
        { code: "W1", name: "Renamed", isInactive: false },
        { code: "W3", name: "Manual", isInactive: false },
      ],
      isms,
    );
    expect(result.updated).toEqual([]);
  });
});

describe("compareModels", () => {
  const brands = new Map([
    ["samsung", "brand-samsung"],
    ["lg", "brand-lg"],
  ]);
  const model = (overrides: Partial<IsmsModelRow> = {}): IsmsModelRow => ({
    skuCode: "TV1",
    name: "55in TV",
    description: "55in TV",
    status: "active",
    brandId: "brand-samsung",
    deletedAt: null,
    ...overrides,
  });
  const sap = (overrides: Partial<SapModelRecord> = {}): SapModelRecord => ({
    skuCode: "TV1",
    name: "55in TV",
    status: "active",
    brandName: "Samsung",
    ...overrides,
  });

  it("reports nothing for an item edited only in fields ISMS doesn't sync", () => {
    // A price edit bumps UpdateDate, so the item is in the window — but nothing synced differs.
    expect(compareModels([sap()], [], [model()], brands)).toEqual({
      created: [],
      updated: [],
      removed: [],
    });
  });

  it.each([
    ["name", sap({ name: "55in QLED" })],
    ["brand", sap({ brandName: "LG" })],
    ["a brand ISMS doesn't have yet", sap({ brandName: "Sony" })],
    ["status", sap({ status: "retired" })],
  ])("reports a %s change as updated", (_label, record) => {
    expect(compareModels([record], [], [model()], brands).updated).toEqual(["TV1"]);
  });

  it("reports a model brought back to active as updated", () => {
    const retired = model({ status: "retired", deletedAt: deleted });
    expect(compareModels([sap()], [], [retired], brands).updated).toEqual(["TV1"]);
  });

  it("reports a new active item as created, but not a new retired one", () => {
    const result = compareModels(
      [sap({ skuCode: "NEW1" }), sap({ skuCode: "OLD1", status: "retired" })],
      [],
      [],
      brands,
    );
    expect(result.created).toEqual(["NEW1"]);
  });

  it("reports an item that lost its brand as removed while it is still live", () => {
    const result = compareModels(
      [],
      ["TV1", "TV2", "UNKNOWN"],
      [model(), model({ skuCode: "TV2", deletedAt: deleted })],
      brands,
    );
    expect(result.removed).toEqual(["TV1"]);
  });
});

describe("nextPendingSerials", () => {
  it("adds new serials, drops ones ISMS now holds, and de-duplicates", () => {
    expect(nextPendingSerials(["S1", "S2"], ["S2", "S3"], new Set(["S1"]))).toEqual({
      pending: ["S2", "S3"],
      capped: false,
    });
  });

  it("caps a large backlog", () => {
    const many = Array.from({ length: SAP_PENDING_SERIALS_CAP + 10 }, (_, i) => `S${i}`);
    const result = nextPendingSerials([], many, new Set());
    expect(result.pending).toHaveLength(SAP_PENDING_SERIALS_CAP);
    expect(result.capped).toBe(true);
  });
});
