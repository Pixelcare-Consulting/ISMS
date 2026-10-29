jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { logMany: jest.fn() },
}));

import ExcelJS from "exceljs";

import {
  planProvinceImport,
  type ExistingProvince,
} from "@/features/lookups/services/province-import.service";
import {
  buildProvinceTemplateWorkbook,
  readProvinceImportWorkbook,
} from "@/features/lookups/services/province-import.workbook";

const REGIONS = [
  { id: "r7", name: "R7: C. VISAYAS" },
  { id: "ncr", name: "NCR" },
];

const EXISTING: ExistingProvince[] = [
  { id: "p-cebu", name: "CEBU", regionId: "r7", recordStatus: "active" },
  { id: "p-bohol", name: "BOHOL", regionId: null, recordStatus: "active" },
];

function row(rowNumber: number, values: Record<string, string>) {
  return { rowNumber, values };
}

describe("planProvinceImport", () => {
  it("creates unmatched rows, defaulting status to active", () => {
    const plan = planProvinceImport([row(2, { name: "MAKATI", region: "ncr" })], EXISTING, REGIONS);
    expect(plan.creates).toEqual([
      { rowNumber: 2, name: "MAKATI", regionId: "ncr", recordStatus: "active" },
    ]);
    expect(plan.preview.canApply).toBe(true);
  });

  it("matches by name ignoring case and only updates changed fields", () => {
    const plan = planProvinceImport(
      [
        row(2, { name: "cebu", region: "R7: C. VISAYAS", status: "active" }),
        row(3, { name: "Bohol", region: "R7: C. VISAYAS", status: "" }),
      ],
      EXISTING,
      REGIONS,
    );
    expect(plan.preview.unchangedCount).toBe(1);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: "p-bohol", data: { regionId: "r7" } });
    expect(plan.updates[0]?.changes).toEqual([
      { label: "Region", from: "—", to: "R7: C. VISAYAS" },
    ]);
  });

  it("leaves region as is when the cell is blank", () => {
    const plan = planProvinceImport(
      [row(2, { name: "CEBU", region: "", status: "inactive" })],
      EXISTING,
      REGIONS,
    );
    expect(plan.updates[0]?.data).toEqual({ recordStatus: "inactive" });
  });

  it("reports unknown regions, bad statuses, blanks and duplicates, and blocks apply", () => {
    const plan = planProvinceImport(
      [
        row(2, { name: "LAGUNA", region: "R4-A" }),
        row(3, { name: "RIZAL", status: "maybe" }),
        row(4, { name: "", region: "NCR" }),
        row(5, { name: "PASIG" }),
        row(6, { name: "pasig" }),
      ],
      EXISTING,
      REGIONS,
    );
    expect(plan.preview.errors.map((error) => error.rowNumber)).toEqual([2, 3, 4, 6]);
    expect(plan.preview.errors[3]?.message).toBe("Duplicate of row 5.");
    expect(plan.preview.canApply).toBe(false);
  });

  it("cannot apply when nothing changes", () => {
    const plan = planProvinceImport([row(2, { name: "CEBU" })], EXISTING, REGIONS);
    expect(plan.preview.unchangedCount).toBe(1);
    expect(plan.preview.canApply).toBe(false);
  });
});

describe("province import workbook", () => {
  it("round-trips the template", async () => {
    const buffer = await buildProvinceTemplateWorkbook([
      { name: "CEBU", region: "R7: C. VISAYAS", status: "active" },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]?.name).toBe("Provinces");

    const rows = await readProvinceImportWorkbook(buffer);
    expect(rows).toEqual([
      { rowNumber: 2, values: { name: "CEBU", region: "R7: C. VISAYAS", status: "active" } },
    ]);
  });

  it("reads a CSV with alias headers", async () => {
    const rows = await readProvinceImportWorkbook(
      Buffer.from("Province,Region Name\nMAKATI,NCR\n"),
    );
    expect(rows[0]?.values).toEqual({ name: "MAKATI", region: "NCR" });
  });

  it("rejects a file without a province column", async () => {
    await expect(readProvinceImportWorkbook(Buffer.from("foo,bar\n1,2\n"))).rejects.toThrow(
      /province_name/,
    );
  });
});
