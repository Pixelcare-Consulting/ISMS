import { changePasswordSchema } from "@/features/settings/schemas/profile-settings.schema";
import { registerSchema } from "@/features/auth/schemas/auth.schema";
import {
  createProviderCustomerUserSchema,
  updateProviderCustomerUserSchema,
} from "@/features/provider/schemas/provider.schema";
import {
  TENANT_CREATE_USER_PASSWORD_MIN,
  createUserSchema,
} from "@/features/users/schemas/create-user.schema";
import { updateUserSchema } from "@/features/users/schemas/update-user.schema";
import {
  combinedPermissionNames,
  pickerRolesForAssignment,
  type PickerRole,
} from "@/features/users/lib/user-role-picker";

const cashier: PickerRole = {
  slug: "cashier",
  name: "Cashier",
  description: "Takes payments",
  isSystem: false,
  permissions: [
    { name: "View sales", area: "Sales & Returns" },
    { name: "Create sale", area: "Sales & Returns" },
  ],
};

const warehouse: PickerRole = {
  slug: "warehouse",
  name: "Warehouse",
  description: "Moves stock",
  isSystem: false,
  permissions: [
    { name: "View sales", area: "Sales & Returns" },
    { name: "View inventory", area: "Inventory" },
  ],
};

const tenantAdmin: PickerRole = {
  slug: "tenant_admin",
  name: "Tenant Admin",
  description: "Built-in administrator",
  isSystem: true,
  permissions: [{ name: "Manage users", area: "Settings" }],
};

const baseCreate = {
  email: "new.person@example.com",
  name: "New Person",
  password: "a".repeat(TENANT_CREATE_USER_PASSWORD_MIN),
  roleSlugs: ["cashier"],
};

describe("tenant create user", () => {
  it("requires at least one role", () => {
    const parsed = createUserSchema.safeParse({ ...baseCreate, roleSlugs: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("At least one role is required");
    }
  });

  it("requires a 12 character password on tenant create only", () => {
    const short = createUserSchema.safeParse({
      ...baseCreate,
      password: "a".repeat(TENANT_CREATE_USER_PASSWORD_MIN - 1),
    });
    expect(short.success).toBe(false);

    const accepted = createUserSchema.safeParse(baseCreate);
    expect(accepted.success).toBe(true);

    expect(
      changePasswordSchema.safeParse({
        currentPassword: "current1",
        newPassword: "newpass1",
        confirmPassword: "newpass1",
      }).success,
    ).toBe(true);

    expect(
      createProviderCustomerUserSchema.safeParse({
        tenantId: "tenant-1",
        email: "person@example.com",
        name: "Person",
        password: "password",
        roleSlug: "cashier",
      }).success,
    ).toBe(true);

    expect(
      updateProviderCustomerUserSchema.safeParse({
        tenantId: "tenant-1",
        userId: "user-1",
        name: "Person",
        roleSlug: "cashier",
        password: "password",
      }).success,
    ).toBe(true);

    const register = registerSchema.safeParse({
      organizationName: "Acme",
      name: "Ada",
      email: "ada@example.com",
      password: "Password1!",
    });
    expect(register.success).toBe(true);
  });
});

describe("combined access", () => {
  it("lists each permission name once", () => {
    expect(
      combinedPermissionNames([cashier, warehouse], ["cashier", "warehouse"]),
    ).toEqual(["View sales", "Create sale", "View inventory"]);
  });
});

describe("hide built-in roles", () => {
  it("omits built-in roles except one already assigned", () => {
    const roles = [cashier, tenantAdmin, warehouse];

    expect(
      pickerRolesForAssignment(roles, {
        hideSystemRoles: true,
        assignedSlugs: [],
      }).map((role) => role.slug),
    ).toEqual(["cashier", "warehouse"]);

    expect(
      pickerRolesForAssignment(roles, {
        hideSystemRoles: true,
        assignedSlugs: ["tenant_admin"],
      }).map((role) => role.slug),
    ).toEqual(["cashier", "tenant_admin", "warehouse"]);

    expect(
      pickerRolesForAssignment(roles, {
        hideSystemRoles: false,
        assignedSlugs: [],
      }).map((role) => role.slug),
    ).toEqual(["cashier", "tenant_admin", "warehouse"]);
  });
});

describe("edit user roles", () => {
  it("requires the full role set", () => {
    const missing = updateUserSchema.safeParse({
      userId: "user-1",
      name: "Ada",
      roleSlugs: [],
    });
    expect(missing.success).toBe(false);

    const kept = updateUserSchema.safeParse({
      userId: "user-1",
      name: "Ada",
      roleSlugs: ["cashier", "warehouse"],
      password: "password",
    });
    expect(kept.success).toBe(true);
    if (kept.success) {
      expect(kept.data.roleSlugs).toEqual(["cashier", "warehouse"]);
    }
  });
});
