/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { SerialActivityTable } from "@/app/(app)/audit-logs/serial-numbers/_components/serial-activity-table";
import type { SerialActivityEvent } from "@/features/serial-activity/constants/serial-activity-display";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/audit-logs/serial-numbers",
}));

jest.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({ display: (column: unknown) => column }),
}));

jest.mock("@/lib/data-table", () => {
  type Cell = (context: { row: { original: unknown; index: number } }) => ReactNode;
  return {
    DataTable: ({
      data,
      columns,
    }: {
      data: unknown[];
      columns: Array<{ id: string; cell: Cell }>;
    }) => (
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
    ),
  };
});

const event: SerialActivityEvent = {
  id: "history:1",
  type: "sold",
  typeLabel: "Replacement",
  timestamp: new Date("2026-03-15T02:00:00.000Z"),
  serialNo: "SN-NEW",
  modelLabel: "TV — 55 inch",
  location: "Main",
  reference: "SI-100",
  referenceDetails: [
    "Transaction SI-100",
    "Transaction date: Mar 15, 2026",
    "Customer: Ana Reyes",
    "Requested by Juan Cruz · Mar 15, 2026, 10:00 AM · Note: Cracked screen",
    "Branch: Main",
  ],
  status: "Replaced",
  performedBy: { name: "Ana", email: "ana@example.com" },
  transaction: {
    transactionNo: "SI-100",
    transactionDate: "Mar 15, 2026",
    amount: "₱12,500",
    customerName: "Ana Reyes",
    customerNumber: "09171234567",
  },
  approvals: [
    {
      action: "Requested",
      person: "Juan Cruz",
      when: "Mar 15, 2026, 10:00 AM",
      note: "Cracked screen",
    },
    {
      action: "Approved",
      person: "Maria Santos",
      when: "Mar 16, 2026, 9:00 AM",
      note: null,
    },
  ],
};

describe("SerialActivityTable view details", () => {
  it("opens and shows the transaction date, customer, and approval lines", () => {
    render(
      <SerialActivityTable
        result={{ items: [event], total: 1, page: 1, pageSize: 25, totalPages: 1 }}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    const dialog = screen.getByRole("dialog", { name: "View details" });
    expect(within(dialog).getByText("Mar 15, 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("Ana Reyes")).toBeInTheDocument();
    expect(within(dialog).getByText("Requested")).toBeInTheDocument();
    expect(within(dialog).getByText("Juan Cruz")).toBeInTheDocument();
    expect(within(dialog).getByText("Approved")).toBeInTheDocument();
    expect(within(dialog).getByText("Maria Santos")).toBeInTheDocument();
    expect(within(dialog).getByText("Note: Cracked screen")).toBeInTheDocument();
  });
});
