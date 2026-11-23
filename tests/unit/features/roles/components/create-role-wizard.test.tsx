/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";

import { CreateRoleWizard } from "@/features/roles/components/create-role-wizard";
import { groupPermissionsByModule } from "@/features/roles/lib/group-permissions-by-module";
import type { PermissionRow } from "@/features/roles/types/role.types";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/features/roles/actions/role.actions", () => ({
  createRoleAction: jest.fn(),
  toggleRolePermissionAction: jest.fn(),
}));

const permissions: PermissionRow[] = [
  {
    id: "custom-view",
    slug: "dashboard.custom.view",
    name: "View custom dashboards",
  },
  {
    id: "custom-manage",
    slug: "dashboard.custom.manage",
    name: "Build custom dashboards",
  },
];

function renderWizard(occupiedSlugs: readonly string[] = ["tenant_admin"]) {
  return render(
    <CreateRoleWizard
      groups={groupPermissionsByModule(permissions)}
      permissions={permissions}
      occupiedSlugs={occupiedSlugs}
    />,
  );
}

describe("CreateRoleWizard slug collision", () => {
  it("explains that a taken name creates a new role with only the selected access", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Tenant Admin" },
    });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "This is a new role, and it only has the access selected here.",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("keeps the reserved-slug error for Super Admin", () => {
    renderWizard(["super_admin"]);
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Super Admin" },
    });

    expect(screen.getByText("This slug is reserved.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("lists Custom dashboards and Build custom dashboards in the access step", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dashboard editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("checkbox", { name: "Toggle Custom dashboards" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Toggle Build custom dashboards" }),
    ).toBeInTheDocument();
  });
});
