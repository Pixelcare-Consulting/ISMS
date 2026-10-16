import { PIXELCARE_AI_TASKS } from "@/features/pixelcare-ai/constants/tasks";
import {
  extractSalesOrderNumbers,
  preparePixelcareOrderLookupStep,
  resolveOrderLookupQueries,
} from "@/features/pixelcare-ai/lib/sales-order-numbers";

describe("extractSalesOrderNumbers", () => {
  it("extracts two SO numbers and keeps the hash", () => {
    const numbers = extractSalesOrderNumbers(
      "Please check SO#2026-10-00009 and so#2026-10-00010 before pickup.",
    );

    expect(numbers).toEqual(["SO#2026-10-00009", "SO#2026-10-00010"]);
    expect(numbers[0]).toContain("#");
    expect(numbers[0]).toBe("SO#2026-10-00009");
    expect(numbers[1]?.startsWith("SO#")).toBe(true);
  });

  it("does not strip the hash or duplicate a repeated number", () => {
    expect(extractSalesOrderNumbers("SO#2026-10-00009, SO#2026-10-00009")).toEqual([
      "SO#2026-10-00009",
    ]);
    expect(extractSalesOrderNumbers("SO2026-10-00009")).toEqual([]);
    expect(
      resolveOrderLookupQueries({ orderNumbers: ["SO#2026-10-00009"] }).queries,
    ).toEqual(["SO#2026-10-00009"]);
  });
});

describe("preparePixelcareOrderLookupStep", () => {
  it("forces findOrderStatus on the first step only when SO numbers are present", () => {
    expect(
      preparePixelcareOrderLookupStep({
        stepNumber: 0,
        salesOrderNumbers: ["SO#2026-10-00009", "SO#2026-10-00010"],
      }),
    ).toEqual({
      toolChoice: { type: "tool", toolName: "findOrderStatus" },
      activeTools: ["findOrderStatus"],
    });

    expect(
      preparePixelcareOrderLookupStep({
        stepNumber: 1,
        salesOrderNumbers: ["SO#2026-10-00009"],
      }),
    ).toEqual({});

    expect(
      preparePixelcareOrderLookupStep({
        stepNumber: 0,
        salesOrderNumbers: [],
      }),
    ).toEqual({});
  });
});

describe("track-order starter", () => {
  it("looks up numbers already in the message and asks only when none were given", () => {
    const starter = PIXELCARE_AI_TASKS.find((task) => task.id === "track-order")?.starterPrompt;
    expect(starter).toContain("call findOrderStatus immediately");
    expect(starter).toContain("keep the #");
    expect(starter).toContain("only when none was given");
    expect(starter).toContain("never invent a status");
  });
});
