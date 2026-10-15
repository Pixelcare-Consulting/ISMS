import { sanitizeMarkdownHref } from "@/features/pixelcare-ai/lib/sanitize-markdown-href";
import { tableFromToolOutput } from "@/features/pixelcare-ai/lib/tool-result-table";

describe("tableFromToolOutput", () => {
  it("builds a stock table from checkBranchStock items", () => {
    const table = tableFromToolOutput("checkBranchStock", {
      items: [
        {
          skuCode: "32STV105",
          name: 'DEVANT 32" LED',
          stkQty: 15,
          availableQty: 15,
          defQty: 0,
        },
      ],
    });

    expect(table?.caption).toBe("Branch stock");
    expect(table?.columns.map((c) => c.key)).toEqual([
      "skuCode",
      "name",
      "stkQty",
      "availableQty",
      "defQty",
    ]);
    expect(table?.rows).toHaveLength(1);
  });

  it("builds a shelf-gap table from explainShelfGaps lines", () => {
    const table = tableFromToolOutput("explainShelfGaps", {
      lines: [{ skuCode: "TV-55-A", name: "TV", maxQty: 6, stkQty: 4, sugQty: 2 }],
    });

    expect(table?.caption).toBe("Shelf gaps (SUG)");
    expect(table?.columns.map((c) => c.key)).toEqual([
      "skuCode",
      "name",
      "shelfMax",
      "stkQty",
      "sugQty",
    ]);
    expect(table?.columns.find((c) => c.key === "shelfMax")?.label).toBe("Shelf max");
    expect(table?.rows[0]?.shelfMax).toBe(6);
  });

  it("prefers shelfMax alias when present on explainShelfGaps lines", () => {
    const table = tableFromToolOutput("explainShelfGaps", {
      lines: [
        {
          skuCode: "TV-55-A",
          name: "TV",
          maxQty: 6,
          shelfMax: 6,
          stkQty: 4,
          sugQty: 2,
        },
      ],
    });

    expect(table?.rows[0]?.shelfMax).toBe(6);
  });

  it("builds a planning runs table", () => {
    const table = tableFromToolOutput("listDemandPlanningRuns", {
      runs: [
        {
          documentNumber: "DP-1",
          periodLabel: "2026-10",
          status: "generated",
          plannedBranchCount: 2,
        },
      ],
    });
    expect(table?.caption).toBe("Planning runs");
    expect(table?.columns.map((c) => c.key)).toEqual([
      "documentNumber",
      "periodLabel",
      "status",
      "plannedBranchCount",
    ]);
  });

  it("builds an allocation gaps table with Shelf max", () => {
    const table = tableFromToolOutput("listAllocationGaps", {
      gaps: [
        {
          skuCode: "TV-55-A",
          name: "TV",
          branchName: "Sample",
          shelfMax: 6,
          currentStock: 4,
          gapQty: 2,
        },
      ],
    });
    expect(table?.caption).toBe("Allocation gaps");
    expect(table?.columns.find((c) => c.key === "shelfMax")?.label).toBe("Shelf max");
  });

  it("returns null on tool errors or empty rows", () => {
    expect(tableFromToolOutput("checkBranchStock", { error: "denied" })).toBeNull();
    expect(tableFromToolOutput("checkBranchStock", { items: [] })).toBeNull();
    expect(tableFromToolOutput("explainReturns", { tips: ["a"] })).toBeNull();
  });
});

describe("sanitizeMarkdownHref", () => {
  it("strips trailing markdown emphasis from hrefs", () => {
    expect(sanitizeMarkdownHref("/inventory?branch=abc*")).toBe("/inventory?branch=abc");
    expect(sanitizeMarkdownHref("/orders/manual?tab=analytics**")).toBe(
      "/orders/manual?tab=analytics",
    );
    expect(sanitizeMarkdownHref("/returns")).toBe("/returns");
  });
});
