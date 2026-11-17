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
