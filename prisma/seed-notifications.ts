import type { PrismaClient } from "@prisma/client";

/**
 * Sample in-app notifications for the demo tenant (header bell).
 * Covers TENANT / ROLE / USER audiences. Idempotent via stable `type` keys.
 * Requires demo tenant + users (`pnpm run db:seed:core` first).
 */
export async function seedDemoNotifications(
  prisma: PrismaClient,
  tenantId: string,
  usersByEmail: Record<string, { id: string }>,
): Promise<number> {
  const superAdmin = usersByEmail["superadmin@demo.local"];
  const createdById = superAdmin?.id ?? null;

  const samples: Array<{
    type: string;
    audience: "TENANT" | "ROLE" | "USER";
    roleSlug?: string;
    userId?: string;
    title: string;
    body: string;
    href: string;
  }> = [
    {
      type: "seed.tenant.welcome",
      audience: "TENANT",
      title: "Welcome to ISMS notifications",
      body: "You will see important updates here — announcements, approvals, and system alerts.",
      href: "/dashboard",
    },
    {
      type: "seed.role.super_admin",
      audience: "ROLE",
      roleSlug: "super_admin",
      title: "Super Admin tip",
      body: "Manage roles and permissions under Settings when you are ready to invite your team.",
      href: "/settings/roles",
    },
    {
      type: "seed.role.tenant_admin",
      audience: "ROLE",
      roleSlug: "tenant_admin",
      title: "Tenant Admin checklist",
      body: "Review company settings and confirm your org branding looks right.",
      href: "/settings/company",
    },
  ];

  if (superAdmin) {
    samples.push({
      type: "seed.user.superadmin",
      audience: "USER",
      userId: superAdmin.id,
      title: "Personal note for Super Admin",
      body: "This sample is targeted only at your account — useful for direct follow-ups.",
      href: "/settings/profile",
    });
  }

  let created = 0;

  for (const sample of samples) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        type: sample.type,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.notification.create({
      data: {
        tenantId,
        audience: sample.audience,
        roleSlug: sample.roleSlug ?? null,
        userId: sample.userId ?? null,
        type: sample.type,
        title: sample.title,
        body: sample.body,
        href: sample.href,
        metadata: { seed: true },
        createdById,
      },
    });
    created += 1;
  }

  console.log(
    `Notifications seed: ${created} created for demo tenant (${samples.length} sample types)`,
  );
  return created;
}
