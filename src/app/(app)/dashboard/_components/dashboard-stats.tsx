import { ReportPreview } from "@/app/(app)/_components/report-preview";
import { DashboardModuleCard } from "@/app/(app)/dashboard/_components/dashboard-module-card";
import { canAccessPolicies, hasPermission } from "@/lib/auth/permissions";

interface DashboardStatsProps {
  permissions: string[];
}

type DashboardCard =
  | {
      title: string;
      description: string;
      href: string;
      modified: string;
      permission: string;
    }
  | {
      title: string;
      description: string;
      href: string;
      modified: string;
      anyPermissions: string[];
    }
  | {
      title: string;
      description: string;
      href: string;
      modified: string;
      check: (permissions: string[]) => boolean;
    };

const cards: DashboardCard[] = [
  {
    title: "Inventory",
    description: "Serialized branch stock",
    href: "/inventory",
    permission: "inventory.view",
    modified: "Today",
  },
  {
    title: "Orders",
    description: "Branch ordering workflow",
    href: "/orders",
    anyPermissions: ["orders.view", "orders.create"],
    modified: "Today",
  },
  {
    title: "Policies",
    description: "ISMS policy documents",
    href: "/policies",
    check: (permissions) => canAccessPolicies(permissions),
    modified: "Today",
  },
  {
    title: "Users",
    description: "Manage team members and access",
    href: "/settings/users",
    permission: "users.manage",
    modified: "Today",
  },
  {
    title: "Roles",
    description: "Configure RBAC permissions",
    href: "/settings/roles",
    permission: "roles.manage",
    modified: "Yesterday",
  },
  {
    title: "Reports",
    description: "View compliance reports",
    href: "/dashboard",
    permission: "reports.view",
    modified: "Mar 12, 2026",
  },
];

function isCardVisible(card: DashboardCard, permissions: string[]) {
  if ("check" in card) {
    return card.check(permissions);
  }
  if ("anyPermissions" in card) {
    return card.anyPermissions.some((p) => hasPermission(permissions, p));
  }
  return hasPermission(permissions, card.permission);
}

export function DashboardStats({ permissions }: DashboardStatsProps) {
  const visible = cards.filter((card) => isCardVisible(card, permissions));

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground shadow-sm">
        No modules available for your role yet.
      </div>
    );
  }

  return (
    <div className="responsive-card-grid">
      {visible.map((card) => (
        <DashboardModuleCard
          key={card.title}
          title={card.title}
          href={card.href}
          modified={card.modified}
        >
          <ReportPreview className="rounded-lg border shadow-sm" />
        </DashboardModuleCard>
      ))}
    </div>
  );
}
