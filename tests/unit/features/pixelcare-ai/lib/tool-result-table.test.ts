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

  it("builds a P-Count sessions table", () => {
    const table = tableFromToolOutput("getPcountStatus", {
      sessions: [
        {
          sessionNo: "PC-1",
          statusLabel: "Counting (open)",
          counting: "Counting (open)",
          posting: "—",
        },
      ],
    });
    expect(table?.caption).toBe("P-Count sessions");
    expect(table?.columns.map((c) => c.key)).toEqual([
      "sessionNo",
      "statusLabel",
      "counting",
      "posting",
    ]);
  });

  it("builds Monthly SIR and ops inbox tables", () => {
    const sir = tableFromToolOutput("listMonthlySirStatus", {
      requests: [
        {
          statusLabel: "For approval",
          branchName: "Sample",
          purpose: "Count",
          sessionNo: null,
        },
      ],
    });
    expect(sir?.caption).toBe("Monthly SIR");

    const inbox = tableFromToolOutput("listOpsInbox", {
      deliveries: [
        {
          deliveryNo: "DLV-1",
          statusName: "Pending",
          branchName: "Sample",
        },
      ],
      transfers: [],
      pullouts: [],
    });
    expect(inbox?.caption).toBe("Operations inbox");
    expect(inbox?.rows[0]?.kind).toBe("Delivery");
  });

  it("shows findOrderStatus hits and explicit misses without a guessed status", () => {
    const table = tableFromToolOutput("findOrderStatus", {
      lookups: [
        {
          query: "SO#2026-10-00009",
          found: true,
          orders: [
            {
              orderNumber: "SO#2026-10-00009",
              statusLabel: "Draft",
              orderType: "manual",
              branchName: "Store A",
            },
          ],
        },
        {
          query: "SO#2026-10-99999",
          found: false,
          note: "Not found in your access scope.",
        },
      ],
    });

    expect(table?.caption).toBe("Orders");
    expect(table?.columns.map((column) => column.key)).toEqual([
      "orderNumber",
      "result",
      "statusLabel",
      "orderType",
      "branchName",
    ]);
    expect(table?.rows.map((row) => row.result)).toEqual(["Found", "Not found"]);
    expect(table?.rows[0]?.orderNumber).toBe("SO#2026-10-00009");
    expect(table?.rows[0]?.statusLabel).toBe("Draft");
    expect(table?.rows[1]?.statusLabel).toBe("—");
    expect(table?.rows[1]).not.toHaveProperty("status");
  });

  it("keeps the legacy findOrderStatus orders table", () => {
    const table = tableFromToolOutput("findOrderStatus", {
      orders: [
        {
          orderNumber: "SO-SAMPLE-001",
          statusLabel: "Pending Supply Planning",
          orderType: "manual",
          branchName: "Sample Branch",
        },
      ],
    });

    expect(table?.caption).toBe("Orders");
    expect(table?.columns.map((column) => column.key)).not.toContain("result");
    expect(table?.rows[0]?.orderNumber).toBe("SO-SAMPLE-001");
  });

  it("returns null on tool errors or empty rows", () => {
    expect(tableFromToolOutput("checkBranchStock", { error: "denied" })).toBeNull();
    expect(
      tableFromToolOutput("findOrderStatus", {
        error: "You do not have order view permission.",
      }),
    ).toBeNull();
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
    expect(sanitizeMarkdownHref("https://example.com/help")).toBe("https://example.com/help");
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeMarkdownHref("data:text/html,hi")).toBeUndefined();
    expect(sanitizeMarkdownHref("//evil.example")).toBeUndefined();
  });
});
