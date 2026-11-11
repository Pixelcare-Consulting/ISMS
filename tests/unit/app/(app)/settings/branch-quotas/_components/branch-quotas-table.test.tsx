/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { BranchQuotasTable } from "@/app/(app)/settings/branch-quotas/_components/branch-quotas-table";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock("@/features/branch-quotas/actions/branch-quota.actions", () => ({
  createBranchQuotaAction: jest.fn(),
  deleteBranchQuotaAction: jest.fn(),
  listBranchQuotaFormOptionsAction: jest.fn(),
  updateBranchQuotaAction: jest.fn(),
}));

jest.mock("@/features/branch-quotas/actions/branch-quota-import.actions", () => ({
  applyBranchQuotaImportChunkAction: jest.fn(),
  downloadBranchQuotaImportTemplateAction: jest.fn(),
  previewBranchQuotaImportAction: jest.fn(),
}));

// @tanstack/react-table ships ESM that Jest cannot load, so this stands in for the
// grid and still renders the real toolbar and column cells the component builds.
jest.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({ display: (column: unknown) => column }),
}));

jest.mock("@/lib/data-table", () => {
  type Cell = (context: { row: { original: unknown; index: number } }) => ReactNode;
  return {
    useClientTableSort: (rows: unknown[]) => ({
      sorted: rows,
      sortKey: null,
      sortDir: "asc",
      toggleSort: jest.fn(),
    }),
    DataTable: ({
      data,
      columns,
      toolbarActions,
    }: {
      data: unknown[];
      columns: Array<{ id: string; cell: Cell }>;
      toolbarActions?: ReactNode;
    }) => (
      <div>
        {toolbarActions}
        {data.map((original, index) =>
          columns.map((column) => (
            <div key={column.id}>{column.cell({ row: { original, index } })}</div>
          )),
        )}
      </div>
    ),
  };
});

const quotas = [
  {
    id: "quota-1",
    branchId: "branch-1",
    brandId: "brand-1",
    quotaDate: "2026-11-01T00:00:00.000Z",
    quotaAmount: "120",
    targetDii: "30",
    branch: { id: "branch-1", name: "Abreeza Davao", sapCode: "ABP001" },
    brand: { id: "brand-1", name: "Samsung" },
  },
];

describe("BranchQuotasTable", () => {
  it("shows quota rows without edit controls to a view-only user", () => {
    render(<BranchQuotasTable quotas={quotas} canManage={false} />);

    expect(screen.getAllByText("Abreeza Davao").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /add quota/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows edit controls to a manager", () => {
    render(<BranchQuotasTable quotas={quotas} canManage />);

    expect(screen.getByRole("button", { name: /add quota/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
