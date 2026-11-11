/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { InventoryApprovalsTable } from "@/app/(app)/audit-logs/inventory-approvals/_components/inventory-approvals-table";
import type { InventoryApprovalRow } from "@/features/inventory-approvals/constants/inventory-approval-display";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/audit-logs/inventory-approvals",
}));

// @tanstack/react-table ships ESM that Jest cannot load, so this stands in for the
// grid and still renders the real filters and column cells the component builds.
jest.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({ display: (column: unknown) => column }),
}));

jest.mock("@/lib/data-table", () => {
  type Cell = (context: { row: { original: unknown; index: number } }) => ReactNode;
  return {
    DataTable: ({
      data,
      columns,
      banner,
      empty,
      emptyMessage,
    }: {
      data: unknown[];
      columns: Array<{ id: string; cell: Cell }>;
      banner?: ReactNode;
      empty?: boolean;
      emptyMessage?: string;
    }) => (
      <div>
        {banner}
        {empty ? <p>{emptyMessage}</p> : null}
        <table>
          <tbody>
            {data.map((original, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.id}>{column.cell({ row: { original, index } })}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  };
});

const row: InventoryApprovalRow = {
  id: "row-1",
  serialNo: "SN100",
  modelLabel: "SKU1 · Phone",
  sourceType: "PULLOUT",
  sourceNo: "PLT-1",
  step: "TL_APPROVAL",
  status: "REJECTED",
  requestedBy: "Ana",
  requestedAt: "2026-11-06T01:00:00.000Z",
  decidedBy: "Team Leader",
  decidedAt: "2026-11-06T02:00:00.000Z",
  remarks: "Wrong unit",
  problemDescription: "No power",
  attachments: [{ id: "file-1", name: "waybill.pdf", href: "/api/logistics/pullout-attachments/file-1" }],
};

function renderTable(items: InventoryApprovalRow[], filters: { currentStatus?: string } = {}) {
  render(
    <InventoryApprovalsTable
      result={{ items, total: items.length, page: 1, pageSize: 25, totalPages: 1 }}
      {...filters}
    />,
  );
}

beforeEach(() => push.mockClear());

describe("InventoryApprovalsTable", () => {
  it("shows who decided what, in Title Case", () => {
    renderTable([row]);

    const cells = within(screen.getByRole("row", { name: /SN100/ }));
    expect(cells.getByText("Rejected")).toBeInTheDocument();
    expect(cells.getByText("Pull-out")).toBeInTheDocument();
    expect(cells.getByText("PLT-1")).toBeInTheDocument();
    expect(cells.getByText("TL approval")).toBeInTheDocument();
    expect(cells.getByText("Team Leader")).toBeInTheDocument();
    expect(cells.getByText("Wrong unit")).toBeInTheDocument();
    expect(cells.getByText("No power")).toBeInTheDocument();
  });

  it("links each attachment in a new tab", () => {
    renderTable([row]);

    const link = screen.getByRole("link", { name: "waybill.pdf" });
    expect(link).toHaveAttribute("href", "/api/logistics/pullout-attachments/file-1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a pending unit with no decision yet", () => {
    renderTable([
      { ...row, status: "PENDING", decidedBy: null, decidedAt: null, remarks: null, attachments: [] },
    ]);

    const cells = within(screen.getByRole("row", { name: /SN100/ }));
    expect(cells.getByText("Pending")).toBeInTheDocument();
    expect(cells.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("has no way to change a row", () => {
    renderTable([row]);

    const cells = within(screen.getByRole("row", { name: /SN100/ }));
    expect(cells.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains an empty list, and an empty filtered list differently", () => {
    renderTable([]);
    expect(screen.getByText("No approvals have been recorded yet.")).toBeInTheDocument();
  });

  it("says when filters hide everything", () => {
    renderTable([], { currentStatus: "PENDING" });
    expect(screen.getByText("No approvals match your filters.")).toBeInTheDocument();
  });

  it("clears back to the unfiltered page", () => {
    renderTable([row], { currentStatus: "PENDING" });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(push).toHaveBeenCalledWith("/audit-logs/inventory-approvals");
  });
});
