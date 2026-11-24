/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { NewSalesTransactionForm } from "@/app/(app)/sales/_components/new-sales-transaction-form";

const createSale = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() },
}));

jest.mock("@/features/sales/actions/sales.actions", () => ({
  uploadSaleProofAction: jest.fn(),
}));

jest.mock("@/app/(app)/sales/_components/sales-source", () => ({
  useSalesEditSource: () => ({
    listHref: "/sales",
    newHref: "/sales/new",
    copy: {
      encodeTitle: "New sales transaction",
      encodeDescription: "Enter header details.",
      backToList: "Back to sales",
      sectionDescription: "Branch, customer, payment, and proof for this sale.",
      soldLabel: "Branch sold",
      stockSourceLabel: "Branch or alternate branch",
      stockSourcePlaceholder: "Select branch with stock…",
      stockSourceNeedsSold: "Select branch sold first…",
      stockSourceSearchPlaceholder: "Search branches with stock…",
      stockSourceEmpty: "No sellable stock in your area.",
      selectStockSourceError: "Select a stock source branch",
      stockSourceLoadError: "Failed to load stock source branches",
    },
    actions: {
      createSale,
      listStockSources: jest.fn(async () => [{ id: "branch-1", name: "Cubao" }]),
    },
    processReturn: {},
  }),
}));

const toastError = toast.error as jest.Mock;

describe("New sales transaction required header", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks the transaction date and contact number and blocks save until both are present", () => {
    render(
      <NewSalesTransactionForm
        branches={[{ id: "branch-1", name: "Cubao" }]}
        autoResolveBranch
        paymentTypes={[{ id: "pay-1", name: "Cash" }]}
        saleTypes={[{ id: "type-1", name: "Retail" }]}
        deliveryMethods={[{ id: "cdm-1", name: "Pickup" }]}
        promoTypes={[]}
        brands={[]}
      />,
    );

    expect(screen.getByText("Transaction date *")).toBeInTheDocument();
    expect(screen.getByText("Contact no. *")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Transaction number *"), {
      target: { value: "1911" },
    });
    fireEvent.change(screen.getByLabelText("Customer name *"), {
      target: { value: "pxc justine" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Transaction" }));

    expect(toastError).toHaveBeenCalledWith("Transaction date is required");
    expect(screen.queryByRole("heading", { name: /are you sure/i })).not.toBeInTheDocument();
    expect(createSale).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Transaction date *"), {
      target: { value: "2026-11-24" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Transaction" }));

    expect(toastError).toHaveBeenCalledWith("Contact number is required");
    expect(createSale).not.toHaveBeenCalled();
  });
});
