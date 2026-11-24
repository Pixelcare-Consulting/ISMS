/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

const mockReplace = jest.fn();
let mockSearch = "";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock("@/features/orders/actions/order.actions", () => ({
  adminBulkCancelOrdersAction: jest.fn(),
  approveOrderAction: jest.fn(),
  deleteDraftOrderAction: jest.fn(),
  listOrdersAction: jest.fn(),
  rejectOrderAction: jest.fn(),
  submitDraftOrderAction: jest.fn(),
}));

jest.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({
    accessor: () => ({}),
    display: () => ({}),
  }),
  metaHelper: () => ({}),
}));

jest.mock("@/lib/data-table", () => ({
  DataTable: ({ searchTrailing }: { searchTrailing?: ReactNode }) => <div>{searchTrailing}</div>,
  nextTableSort: jest.fn(),
}));

jest.mock("@/lib/data-table/data-table-features", () => ({
  dataTableFeatures: {},
}));

jest.mock("@/app/(app)/orders/_components/create-order-form", () => ({
  CreateOrderSetupDialog: () => null,
}));

jest.mock("@/app/(app)/orders/_components/order-details-dialog", () => ({
  OrderDetailsDialog: () => null,
}));

jest.mock("@/app/(app)/orders/_components/suggested-orders-dialog", () => ({
  SuggestedOrdersDialog: () => null,
}));

jest.mock("@/app/(app)/orders/_components/order-workflow-dialog", () => ({
  OrderWorkflowDialog: () => null,
}));

jest.mock("@/app/(app)/logistics/_components/check-sap-now-button", () => ({
  CheckSapNowButton: () => null,
}));

import { OrdersTable } from "@/app/(app)/orders/_components/orders-table";
import { listOrdersAction } from "@/features/orders/actions/order.actions";

const listOrders = listOrdersAction as jest.Mock;

const page = {
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const leaders = [{ id: "tl-maria", name: "Maria Santos" }];
const brands = [{ id: "devant", name: "Devant" }];

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  mockSearch = "";
  mockReplace.mockReset();
  listOrders.mockResolvedValue(page);
});

function renderOrders(props: Partial<ComponentProps<typeof OrdersTable>> = {}) {
  return render(
    <OrdersTable
      result={page}
      viewerRoleSlugs={[]}
      teamLeaders={leaders}
      brands={brands}
      basePath="/orders/manual"
      fixedOrderType="manual"
      {...props}
    />,
  );
}

function field(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

describe("Orders Team Leader filter", () => {
  it("shows the Team Leader dropdown beside All brands", () => {
    renderOrders({ teamLeaders: [] });

    const brandsField = field("orders-brand-filter");
    const leadersField = field("orders-team-leader-filter");

    expect(brandsField).toHaveTextContent("All brands");
    expect(leadersField).toHaveTextContent("All team leaders");
    expect(
      brandsField.compareDocumentPosition(leadersField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("stays on the picked leader and requests that leader's orders", async () => {
    const pushState = jest.spyOn(window.history, "pushState").mockImplementation(() => {});
    renderOrders();

    fireEvent.click(field("orders-team-leader-filter"));
    fireEvent.click(screen.getByRole("option", { name: "Maria Santos" }));

    await waitFor(() => {
      expect(listOrders).toHaveBeenCalledWith(
        expect.objectContaining({ teamLeaderId: "tl-maria" }),
      );
    });

    expect(field("orders-team-leader-filter")).toHaveTextContent("Maria Santos");
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("tl=tl-maria"));
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("keeps a leader already stored in the URL", () => {
    mockSearch = "tl=tl-maria";
    renderOrders();

    expect(field("orders-team-leader-filter")).toHaveTextContent("Maria Santos");
  });
});
