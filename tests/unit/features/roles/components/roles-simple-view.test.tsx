/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";

import { RolesSimpleView } from "@/features/roles/components/roles-simple-view";
import type { RolesPermissionsMatrix } from "@/features/roles/types/role.types";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/features/roles/actions/role.actions", () => ({
  deleteRoleAction: jest.fn(),
  setHideSystemRolesOnUsersAction: jest.fn(),
  createRoleAction: jest.fn(),
  toggleRolePermissionAction: jest.fn(),
}));

const matrix: RolesPermissionsMatrix = {
  permissions: [],
  roles: [
    {
      id: "system-1",
      slug: "tenant_admin",
      name: "Tenant Admin",
      description: "Built-in administrator",
      isSystem: true,
      userCount: 1,
      permissionSlugs: [],
    },
    {
      id: "custom-1",
      slug: "cashier",
      name: "Cashier",
      description: "Takes payments",
      isSystem: false,
      userCount: 0,
      permissionSlugs: [],
    },
  ],
};

function renderRoles(hideSystemRolesOnUsers: boolean) {
  return render(
    <RolesSimpleView
      matrix={matrix}
      canManageSystemRoleAccess
      hideSystemRolesOnUsers={hideSystemRolesOnUsers}
    />,
  );
}

describe("RolesSimpleView built-in cards", () => {
  it("hides built-in role cards while the switch is on, including search", () => {
    renderRoles(true);

    expect(screen.getByRole("heading", { name: "System roles" })).toBeInTheDocument();
    expect(
      screen.getByText("Built-in roles are hidden. Turn this off to show them."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Built-in roles. You can adjust access; renaming and deleting stay locked.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Hide when adding a user" }),
    ).toBeChecked();
    expect(screen.getByRole("heading", { name: "Cashier" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tenant Admin" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /search roles/i }), {
      target: { value: "Tenant Admin" },
    });

    expect(screen.queryByRole("heading", { name: "Tenant Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cashier" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Built-in roles are hidden. Turn this off to show them."),
    ).toBeInTheDocument();
  });

  it("shows built-in role cards when the switch is off", () => {
    renderRoles(false);

    expect(screen.getByRole("heading", { name: "Tenant Admin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cashier" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Built-in roles. You can adjust access; renaming and deleting stay locked.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Built-in roles are hidden. Turn this off to show them."),
    ).not.toBeInTheDocument();
  });
});
