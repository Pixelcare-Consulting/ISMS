jest.mock("@/lib/auth/auth", () => ({
  syncCredentialAccountPassword: jest.fn(),
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));

jest.mock("@/features/users/repositories/user.repository", () => ({
  userRepository: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    assignRole: jest.fn(),
    setRoles: jest.fn(),
    update: jest.fn(),
    updatePasswordHash: jest.fn(),
    deleteSessions: jest.fn(),
    setDisabledAt: jest.fn(),
    softDelete: jest.fn(),
  },
}));

jest.mock("@/features/users/repositories/role.repository", () => ({
  roleRepository: {
    findBySlug: jest.fn(),
  },
}));

jest.mock("@/features/users/repositories/department.repository", () => ({
  departmentRepository: {
    findById: jest.fn(),
  },
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: jest.fn(async () => "hashed"),
    compare: jest.fn(),
  },
}));

import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";
import { userService } from "@/features/users/services/user.service";

const findBySlug = roleRepository.findBySlug as jest.Mock;
const findByEmail = userRepository.findByEmail as jest.Mock;
const findById = userRepository.findById as jest.Mock;
const create = userRepository.create as jest.Mock;
const assignRole = userRepository.assignRole as jest.Mock;
const setRoles = userRepository.setRoles as jest.Mock;
const update = userRepository.update as jest.Mock;
const deleteSessions = userRepository.deleteSessions as jest.Mock;
const setDisabledAt = userRepository.setDisabledAt as jest.Mock;
const softDelete = userRepository.softDelete as jest.Mock;

const superAdmin = {
  id: "user-sa",
  email: "superadmin@demo.local",
  userRoles: [{ role: { slug: "super_admin", name: "Super Admin" } }],
};

describe("userService roles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findByEmail.mockResolvedValue(null);
    create.mockResolvedValue({ id: "user-1", email: "ada@example.com" });
    findById.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      userRoles: [],
    });
    update.mockResolvedValue({});
    setRoles.mockResolvedValue(undefined);
    assignRole.mockResolvedValue(undefined);
  });

  it("creates a user who can sign in with the password they were given", async () => {
    findBySlug.mockResolvedValue({ id: "role-cashier", slug: "cashier" });

    await userService.createUser({
      tenantId: "tenant-1",
      email: "ada@example.com",
      name: "Ada",
      password: "long-enough-password",
      roleSlugs: ["cashier"],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: false }),
    );
  });

  it("refuses to create a user with no role", async () => {
    await expect(
      userService.createUser({
        tenantId: "tenant-1",
        email: "ada@example.com",
        name: "Ada",
        password: "long-enough-password",
        roleSlugs: [],
      }),
    ).rejects.toThrow("At least one role is required");

    expect(create).not.toHaveBeenCalled();
  });

  it("replaces the full role set when a user is edited", async () => {
    findBySlug.mockImplementation(async (_tenantId: string, slug: string) => {
      if (slug === "cashier") return { id: "role-cashier", slug };
      if (slug === "warehouse") return { id: "role-warehouse", slug };
      return null;
    });

    await userService.updateUser({
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      userId: "user-1",
      name: "Ada",
      roleSlugs: ["cashier", "warehouse"],
    });

    expect(setRoles).toHaveBeenCalledWith("user-1", [
      "role-cashier",
      "role-warehouse",
    ]);
  });
});

describe("userService sessions and access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findById.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      userRoles: [{ role: { slug: "cashier" } }],
    });
    deleteSessions.mockResolvedValue(1);
    setDisabledAt.mockResolvedValue({});
    softDelete.mockResolvedValue({});
  });

  it("deletes a Super Admin session, including their own", async () => {
    findById.mockResolvedValue(superAdmin);

    const result = await userService.resetUserSessions({
      tenantId: "tenant-1",
      actorUserId: "user-sa",
      userId: "user-sa",
    });

    expect(deleteSessions).toHaveBeenCalledWith("user-sa");
    expect(result).toEqual({ cleared: 1 });
  });

  it("still refuses a normal user resetting their own session", async () => {
    await expect(
      userService.resetUserSessions({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("You cannot reset your own session");

    expect(deleteSessions).not.toHaveBeenCalled();
  });

  it("refuses to update a Super Admin", async () => {
    findById.mockResolvedValue(superAdmin);

    await expect(
      userService.updateUser({
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        userId: "user-sa",
        name: "Super Admin",
        roleSlugs: ["cashier"],
      }),
    ).rejects.toThrow("This user cannot be modified");

    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to delete a Super Admin", async () => {
    findById.mockResolvedValue(superAdmin);

    await expect(
      userService.deleteUser({
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        userId: "user-sa",
      }),
    ).rejects.toThrow("This user cannot be deleted");

    expect(softDelete).not.toHaveBeenCalled();
  });

  it("refuses to disable a Super Admin", async () => {
    findById.mockResolvedValue(superAdmin);

    await expect(
      userService.disableUser({
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        userId: "user-sa",
      }),
    ).rejects.toThrow("This user cannot be disabled");

    expect(setDisabledAt).not.toHaveBeenCalled();
    expect(deleteSessions).not.toHaveBeenCalled();
  });

  it("disables an account and clears its sessions", async () => {
    await userService.disableUser({
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      userId: "user-1",
    });

    expect(setDisabledAt).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      expect.any(Date),
    );
    expect(deleteSessions).toHaveBeenCalledWith("user-1");
  });

  it("clears disabledAt when an account is enabled", async () => {
    await userService.enableUser({
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      userId: "user-1",
    });

    expect(setDisabledAt).toHaveBeenCalledWith("tenant-1", "user-1", null);
    expect(deleteSessions).not.toHaveBeenCalled();
  });
});
