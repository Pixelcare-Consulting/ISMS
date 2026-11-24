/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { MonthlySirPanel } from "@/app/(app)/inventory/monthly-sir/_components/monthly-sir-panel";
import type { MonthlySirCapabilities } from "@/features/monthly-sir/constants/monthly-sir-permissions";
import type { PcountUploadAllowance } from "@/features/monthly-sir/lib/pcount-upload-allowance";

type MockCell = (context: { row: { original: unknown; index: number } }) => ReactNode;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

// @tanstack/react-table ships ESM that Jest cannot load. The stand-in still
// renders the action cells this panel builds, which is where the buttons live.
jest.mock("@tanstack/react-table", () => ({
  createColumnHelper: () => ({
    accessor: (_accessor: unknown, column: unknown) => column,
    display: (column: unknown) => column,
  }),
}));

jest.mock("@/lib/data-table", () => ({
  DataTable: ({
    data,
    columns,
  }: {
    data: unknown[];
    columns: Array<{ id?: string; cell?: MockCell }>;
  }) => (
    <div>
      {data.map((original, index) =>
        columns.map((column, columnIndex) =>
          typeof column.cell === "function" ? (
            <div key={`${column.id ?? columnIndex}-${index}`}>
              {column.cell({ row: { original, index } })}
            </div>
          ) : null,
        ),
      )}
    </div>
  ),
}));

jest.mock("@/features/monthly-sir/actions/monthly-sir.actions", () => ({
  applyMonthlySirUploadAction: jest.fn(),
  buildMonthlySirTemplateFromScansAction: jest.fn(),
  createMonthlySirRequestAction: jest.fn(),
  downloadMonthlySirTemplateAction: jest.fn(),
  generateMonthlySirVarianceAction: jest.fn(),
  getPcountUploadAllowanceAction: jest.fn(),
  previewMonthlySirUploadAction: jest.fn(),
  reviewMonthlySirRequestAction: jest.fn(),
  validateMonthlySirScansAction: jest.fn(),
}));

const closedAllowance: PcountUploadAllowance = {
  role: "tl",
  unlimited: false,
  canDirectUpload: false,
  mustRequest: true,
  slotsRemainingToday: 0,
  slotsRemainingMonth: 0,
  slotsTotalMonth: 1,
  activeHalf: null,
  message: null,
};

const noButtons: MonthlySirCapabilities = {
  canDownloadTemplate: false,
  canScanSerials: false,
  canUpload: false,
  canGenerateVariance: false,
  canOpenPcount: false,
  canApprove: false,
};

const branch = { id: "branch-1", name: "Main", sapCode: "M1" };

const approvedCount = {
  id: "request-1",
  purpose: "Month end count",
  status: "approved" as const,
  reviewRemarks: null,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  uploadedAt: null,
  branch,
  requestedBy: { name: "Ada", email: "ada@example.com" },
  stockCountSession: { id: "session-1", sessionNo: "PC-1", status: "in_progress" },
};

function renderPanel(capabilities: MonthlySirCapabilities) {
  return render(
    <MonthlySirPanel
      requests={{
        items: [approvedCount],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }}
      branches={[branch]}
      tab="all"
      branchId={branch.id}
      capabilities={capabilities}
      initialAllowance={closedAllowance}
      initialAllowanceBranchId={branch.id}
    />,
  );
}

describe("Monthly SIR panel buttons", () => {
  it("does not show upload when the role only has View", () => {
    renderPanel(noButtons);

    expect(screen.queryByRole("button", { name: "Upload P-COUNT" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request to upload P-COUNT" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download template" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan serials" })).not.toBeInTheDocument();
  });

  it("keeps upload, including Request to upload, when that checkbox is on", () => {
    renderPanel({ ...noButtons, canUpload: true });

    expect(screen.getByRole("button", { name: "Request to upload P-COUNT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload P-COUNT" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan serials" })).not.toBeInTheDocument();
  });
});
