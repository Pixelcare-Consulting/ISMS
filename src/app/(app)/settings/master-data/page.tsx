import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  MapPin,
  Package,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/permissions";
import { MASTER_DATA_TAB_GROUPS } from "@/config/section-tabs";
import { SidebarNavNewBadge } from "@/app/(app)/_components/sidebar-nav-new-badge";

const GROUP_ICONS: Record<string, LucideIcon> = {
  Products: Package,
  Geography: MapPin,
  Sales: ShoppingCart,
  Service: Wrench,
  Operations: ClipboardList,
};

export default async function MasterDataPage() {
  await requirePermission("master_data.manage");

  return (
    <div className="space-y-8">
      {MASTER_DATA_TAB_GROUPS.map((group) => {
        const Icon = GROUP_ICONS[group.label];
        return (
          <section key={group.label} className="space-y-3">
            <div className="flex items-center gap-2">
              {Icon ? (
                <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
              ) : null}
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{item.label}</p>
                      {item.badge === "new" ? <SidebarNavNewBadge /> : null}
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
