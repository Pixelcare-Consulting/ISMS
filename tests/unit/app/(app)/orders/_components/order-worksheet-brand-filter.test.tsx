/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";

import {
  OrderWorksheet,
  OrderWorksheetAsideSummary,
  type OrderWorksheetProps,
} from "@/app/(app)/orders/_components/order-worksheet";
import type { WorksheetPlanningFigures } from "@/features/orders/lib/order-worksheet";
import type {
  OrderWorksheetLine,
  OrderWorksheetSummary,
} from "@/features/orders/types/order-analytics";

// TanStack Table is ESM-only, and the Create Order layout does not render a data table.
jest.mock("@tanstack/react-table", () => ({}));
jest.mock("@/lib/data-table", () => ({}));
jest.mock("@/lib/data-table/data-table-features", () => ({}));

// The brand picker's list needs these browser APIs, which jsdom does not provide.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

const LINE: OrderWorksheetLine = {
  modelId: "m1",
  skuCode: "32STV105",
  name: "DEVANT 32 TV",
  brandId: "devant",
  brandName: "Devant",
  modelStatus: "active",
  origin: "planogram",
  newlyOrderable: true,
  onPlanogram: true,
  matchesBrandFilter: true,
  shelfMax: 12,
  srp: 10_450,
  cbm: 0,
  inventory: {
    onHandQty: 0,
    availableToSellQty: 0,
    defectiveQty: 0,
    awaitingPulloutQty: 0,
    transitIncomingQty: 0,
    transitOutgoingQty: 0,
    transitUnclassifiedQty: 0,
    ditQty: 0,
    byStatus: [],
  },
  salesQty: 0,
  salesAmount: 0,
  salesUnavailable: false,
  sugQty: 12,
  suggestionUnavailableReason: null,
  milDays: 30,
  incomingQty: 0,
  outstandingOrderQty: 0,
};

function sheetProps(overrides: Partial<OrderWorksheetProps> = {}): OrderWorksheetProps {
  return {
    lines: [LINE],
    brands: [{ id: "devant", name: "Devant" }],
    drafts: {},
    mode: "create",
    orderType: "manual",
    summary: null,
    summaryMode: "current",
    hideSummary: true,
    showApprovedQty: false,
    approvedQtyEditable: false,
    showSpRemarks: false,
    spRemarksEditable: false,
    ...overrides,
  };
}

describe("Create Order brand filter", () => {
  it("tells the form which brand was picked", () => {
    const onBrandIdChange = jest.fn();
    render(<OrderWorksheet {...sheetProps({ brandId: "", onBrandIdChange })} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Devant" }));

    expect(onBrandIdChange).toHaveBeenCalledWith("devant");
  });

  it("shows the selected brand's figures in the summary", () => {
    const summary = {
      inventoryAsOf: "2026-11-04T05:56:00.000Z",
      salesPeriodLabel: "November 1–4, 2026",
    } as OrderWorksheetSummary;
    const figures = {
      computedDii: 16.72,
      diiUnavailableReason: null,
      salesUnavailable: false,
      targetDiiDays: 10,
      inventoryAmount: 41_800,
    } as WorksheetPlanningFigures;
    render(
      <OrderWorksheetAsideSummary
        summary={summary}
        figures={figures}
        totals={{ requestedAmount: 20_900, requestedCbm: 0 } as never}
      />,
    );

    expect(screen.getByText("16.7")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });
});
