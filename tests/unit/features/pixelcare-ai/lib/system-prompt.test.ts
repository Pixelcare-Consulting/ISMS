import { buildPixelcareAiSystemPrompt } from "@/features/pixelcare-ai/lib/system-prompt";

describe("buildPixelcareAiSystemPrompt", () => {
  it("includes active branchId for tools and workflow guidance", () => {
    const prompt = buildPixelcareAiSystemPrompt({
      sampleMode: false,
      context: { branchId: "clbranchabp00000000000001" },
      activeBranch: {
        id: "clbranchabp00000000000001",
        name: "ABENSON ABREEZA DAVAO",
        sapCode: "ABP001",
      },
      userName: "Tester",
    });

    expect(prompt).toContain("ABENSON ABREEZA DAVAO (ABP001)");
    expect(prompt).toContain("Active branchId (for tools): clbranchabp00000000000001");
    expect(prompt).toContain("listPermittedBranches");
    expect(prompt).toContain("without re-asking for a branch code");
    expect(prompt).toContain("Do not invent Settings menus or navigation paths");
    expect(prompt).toContain("call listPermittedBranches");
    expect(prompt).toContain("You cannot create, submit, or approve orders");
    expect(prompt).toContain("Order Analytics");
    expect(prompt).toContain("Proceed to order");
    expect(prompt).toContain("Create order");
    expect(prompt).toContain("/orders/manual?tab=analytics");
    expect(prompt).toContain("GitHub-flavored Markdown tables");
    expect(prompt).toContain("Never use space-padded or tab-aligned plain-text columns");
    expect(prompt).toContain("Never append markdown markers");
    expect(prompt).toContain('Say "Shelf max"');
    expect(prompt).toContain("never say maxQty");
    expect(prompt).toContain("Suggested order qty / SUG = Shelf max − on-hand (STK)");
    expect(prompt).toContain("Shelf max | STK | SUG");
    expect(prompt).toContain("planning/forecast");
    expect(prompt).toContain("listDemandPlanningRuns");
    expect(prompt).toContain("getCoverageMonitor");
    expect(prompt).toContain("listAllocationGaps");
    expect(prompt).toContain("listDraftSuggestedOrders");
    expect(prompt).toContain("do not invent another forecast");
  });

  it("reminds sample mode cannot place live orders", () => {
    const prompt = buildPixelcareAiSystemPrompt({ sampleMode: true });
    expect(prompt).toContain("sample fixtures cannot become live orders");
  });
});
