/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
    expect(screen.getByText("SERIAL-B · SKU")).toBeInTheDocument();
    expect(screen.queryByText("SERIAL-A · SKU")).not.toBeInTheDocument();
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
    expect(screen.getByText("SERIAL-SOURCE-2 · SKU")).toBeInTheDocument();
    expect(screen.queryByText("SERIAL-SOURCE-1 · SKU")).not.toBeInTheDocument();
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
    expect(screen.getByText("STK-100 · SKU")).toBeInTheDocument();
    expect(screen.queryByText(/SLD-900/)).not.toBeInTheDocument();
  });
});
