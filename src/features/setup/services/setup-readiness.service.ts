import { prisma } from "@/lib/database/client";

export type SetupReadinessStatus = "ready" | "missing";

export type SetupReadinessCard = {
  href: string;
  label: string;
  description: string;
  status: SetupReadinessStatus;
};

export type SetupReadinessCounts = {
  companyNamed: boolean;
  warehouses: number;
  branches: number;
  users: number;
  models: number;
  priceLists: number;
  pulloutClassifications: number;
  saleTypes: number;
};

function status(ready: boolean): SetupReadinessStatus {
  return ready ? "ready" : "missing";
}

/** Pure map from tenant counts to the Setup home cards. */
export function toSetupReadinessCards(
  counts: SetupReadinessCounts,
): SetupReadinessCard[] {
  return [
    {
      href: "/settings/company",
      label: "Company",
      description: "Organization name shown to your team.",
      status: status(counts.companyNamed),
    },
    {
      href: "/settings/branches",
      label: "Places",
      description: "At least one warehouse and one branch.",
      status: status(counts.warehouses >= 1 && counts.branches >= 1),
    },
    {
      href: "/settings/users",
      label: "People",
      description: "At least one other user besides this account.",
      status: status(counts.users >= 1),
    },
    {
      href: "/settings/master-data/models",
      label: "Catalog",
      description: "At least one model and one price list.",
      status: status(counts.models >= 1 && counts.priceLists >= 1),
    },
    {
      href: "/settings/master-data/pullout-classifications",
      label: "Pull-out lookups",
      description: "At least one pull-out classification.",
      status: status(counts.pulloutClassifications >= 1),
    },
    {
      href: "/settings/master-data/sale-types",
      label: "Sales lookups",
      description: "At least one sale type.",
      status: status(counts.saleTypes >= 1),
    },
  ];
}

/** Counts for the signed-in tenant. `users` excludes the current account. */
export async function getSetupReadiness(
  tenantId: string,
  currentUserId: string,
): Promise<SetupReadinessCard[]> {
  const [
    tenant,
    warehouses,
    branches,
    users,
    models,
    priceLists,
    pulloutClassifications,
    saleTypes,
  ] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { name: true },
    }),
    prisma.warehouse.count({ where: { tenantId, deletedAt: null } }),
    prisma.branch.count({ where: { tenantId, deletedAt: null } }),
    prisma.user.count({
      where: {
        tenantId,
        deletedAt: null,
        id: { not: currentUserId },
      },
    }),
    prisma.productModel.count({ where: { tenantId, deletedAt: null } }),
    prisma.priceList.count({ where: { tenantId } }),
    prisma.pulloutClassification.count({ where: { tenantId } }),
    prisma.saleType.count({ where: { tenantId } }),
  ]);

  return toSetupReadinessCards({
    companyNamed: Boolean(tenant?.name.trim()),
    warehouses,
    branches,
    users,
    models,
    priceLists,
    pulloutClassifications,
    saleTypes,
  });
}
