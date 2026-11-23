jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));

jest.mock("@/features/users/repositories/role.repository", () => ({
  roleRepository: {
    findBySlug: jest.fn(),
    create: jest.fn(),
    grantPermission: jest.fn(),
  },
}));

import { auditService } from "@/features/audit/services/audit.service";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { roleService } from "@/features/roles/services/role.service";

const findBySlug = roleRepository.findBySlug as jest.Mock;
const create = roleRepository.create as jest.Mock;
const grantPermission = roleRepository.grantPermission as jest.Mock;

describe("roleService.createRole slug collision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    create.mockImplementation(async (data: Record<string, unknown>) => ({
      id: "role-new",
      ...data,
    }));
  });

  it("stores tenant_admin_2 and does not mark Tenant Admin as a system role", async () => {
    findBySlug.mockImplementation(async (_tenantId: string, slug: string) =>
      slug === "tenant_admin"
        ? { id: "built-in", slug, isSystem: true, name: "Tenant Admin" }
        : null,
    );

    const role = await roleService.createRole({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      name: "Tenant Admin",
    });

    expect(role.slug).toBe("tenant_admin_2");
    expect(role.isSystem).toBe(false);
    expect(create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      slug: "tenant_admin_2",
      name: "Tenant Admin",
      description: null,
      isSystem: false,
    });
    expect(grantPermission).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role.created",
        metadata: { slug: "tenant_admin_2", name: "Tenant Admin" },
      }),
    );
  });

  it("uses tenant_admin_3 when tenant_admin_2 is also taken", async () => {
    findBySlug.mockImplementation(async (_tenantId: string, slug: string) =>
      slug === "tenant_admin" || slug === "tenant_admin_2"
        ? { id: slug, slug, isSystem: slug === "tenant_admin" }
        : null,
    );

    const role = await roleService.createRole({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      name: "Tenant Admin",
    });

    expect(role.slug).toBe("tenant_admin_3");
    expect(role.isSystem).toBe(false);
    expect(grantPermission).not.toHaveBeenCalled();
  });

  it("keeps Super Admin reserved", async () => {
    await expect(
      roleService.createRole({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        name: "Super Admin",
      }),
    ).rejects.toThrow("This slug is reserved");

    expect(create).not.toHaveBeenCalled();
    expect(findBySlug).not.toHaveBeenCalled();
  });
});
