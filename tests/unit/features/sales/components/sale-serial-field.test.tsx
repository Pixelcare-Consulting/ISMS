/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

jest.mock("@/features/sales/actions/sales.actions", () => ({
  listSaleableSerialsAction: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { SaleSerialField } from "@/app/(app)/sales/_components/sale-serial-field";
import { listSaleableSerialsAction } from "@/features/sales/actions/sales.actions";

const listSerials = listSaleableSerialsAction as jest.Mock;

type SerialPage = {
  items: Array<{
    id: string;
    serialNo: string;
    modelId: string;
    skuCode: string;
    modelName: string;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function serialPage(id: string, serialNo: string): SerialPage {
  return {
    items: [
      {
        id,
        serialNo,
        modelId: "model",
        skuCode: "SKU",
        modelName: "Model",
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub;
});

beforeEach(() => {
  jest.clearAllMocks();
});

async function openList() {
  fireEvent.click(screen.getByRole("combobox"));
  await screen.findByRole("listbox");
}

describe("SaleSerialField", () => {
  it("does not let a slower lookup replace options after the model changes", async () => {
    const first = deferred<SerialPage>();
    const second = deferred<SerialPage>();
    listSerials.mockImplementation((input: { modelId: string }) =>
      input.modelId === "model-b" ? second.promise : first.promise,
    );

    const { rerender } = render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-a"
        value=""
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(listSerials).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "branch-1", modelId: "model-a" }),
      ),
    );

    rerender(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-b"
        value=""
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(listSerials).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "branch-1", modelId: "model-b" }),
      ),
    );

    await act(async () => {
      second.resolve(serialPage("sn-b", "SERIAL-B"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading serials…")).not.toBeInTheDocument(),
    );

    await act(async () => {
      first.resolve(serialPage("sn-a", "SERIAL-A"));
    });

    await openList();
    expect(screen.getByText("SERIAL-B")).toBeInTheDocument();
    expect(screen.queryByText("SERIAL-A")).not.toBeInTheDocument();
  });

  it("does not let a slower lookup replace options after the stock source changes", async () => {
    const first = deferred<SerialPage>();
    const second = deferred<SerialPage>();
    listSerials.mockImplementation((input: { branchId: string }) =>
      input.branchId === "branch-2" ? second.promise : first.promise,
    );

    const { rerender } = render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-1"
        value=""
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(listSerials).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "branch-1", modelId: "model-1" }),
      ),
    );

    rerender(
      <SaleSerialField
        stockBranchId="branch-2"
        modelId="model-1"
        value=""
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(listSerials).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "branch-2", modelId: "model-1" }),
      ),
    );

    await act(async () => {
      second.resolve(serialPage("sn-2", "SERIAL-SOURCE-2"));
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading serials…")).not.toBeInTheDocument(),
    );

    await act(async () => {
      first.resolve(serialPage("sn-1", "SERIAL-SOURCE-1"));
    });

    await openList();
    expect(screen.getByText("SERIAL-SOURCE-2")).toBeInTheDocument();
    expect(screen.queryByText("SERIAL-SOURCE-1")).not.toBeInTheDocument();
  });

  it("lists TO-FOLLOW and the lookup rows, not a sold serial the lookup omitted", async () => {
    listSerials.mockResolvedValue(serialPage("sn-stk", "STK-100"));

    render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-1"
        value=""
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading serials…")).not.toBeInTheDocument(),
    );
    await openList();

    expect(screen.getByText("TO-FOLLOW")).toBeInTheDocument();
    expect(screen.getByText("STK-100")).toBeInTheDocument();
    expect(screen.queryByText(/SLD-900/)).not.toBeInTheDocument();
  });

  it("marks aged serials in the list and notes a dr-date age under the field", async () => {
    listSerials.mockResolvedValue({
      items: [
        {
          id: "sn-old",
          serialNo: "OLD-1",
          modelId: "model",
          skuCode: "SKU",
          modelName: "Model",
        },
        {
          id: "sn-new",
          serialNo: "NEW-1",
          modelId: "model",
          skuCode: "SKU",
          modelName: "Model",
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
    });

    render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-1"
        value="sn-old"
        selectedSerial={{ id: "sn-old", serialNo: "OLD-1", skuCode: "SKU" }}
        agedSerials={[{ id: "sn-old", ageDays: 45, fromDrDate: true }]}
        onChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText("This serial is 45 days from dr date."),
    ).toBeInTheDocument();

    await openList();
    const list = screen.getByRole("listbox");
    expect(within(list).getByText("OLD-1 · 45 days")).toBeInTheDocument();
    expect(within(list).getByText("NEW-1")).toBeInTheDocument();
    expect(within(list).queryByText(/aging/)).not.toBeInTheDocument();
  });

  it("says when the age used the day the unit was added", async () => {
    listSerials.mockResolvedValue(serialPage("sn-added", "ADDED-1"));

    render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-1"
        value="sn-added"
        selectedSerial={{ id: "sn-added", serialNo: "ADDED-1", skuCode: "SKU" }}
        agedSerials={[{ id: "sn-added", ageDays: 45, fromDrDate: false }]}
        onChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText(
        "This serial is 45 days old. No dr date is recorded.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/from dr date/)).not.toBeInTheDocument();
  });

  it("shows nothing under the field when the selected serial is not aged", async () => {
    listSerials.mockResolvedValue(serialPage("sn-stk", "STK-100"));

    render(
      <SaleSerialField
        stockBranchId="branch-1"
        modelId="model-1"
        value="sn-stk"
        selectedSerial={{ id: "sn-stk", serialNo: "STK-100", skuCode: "SKU" }}
        agedSerials={[{ id: "sn-other", ageDays: 45, fromDrDate: true }]}
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading serials…")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/This serial is/)).not.toBeInTheDocument();
  });
});
