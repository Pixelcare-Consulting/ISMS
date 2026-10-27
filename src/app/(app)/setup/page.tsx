import {
  ArrowUpToLine,
  Building2,
  ChevronRight,
  MapPin,
  Package,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { isTenantSetupAdmin } from "@/features/roles/constants/setup-access";
import { getSetupReadiness } from "@/features/setup/services/setup-readiness.service";
import {
  requireAuth,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { cn } from "@/utils/cn";

const CARD_ICONS: Record<string, LucideIcon> = {
  "/settings/company": Building2,
  "/settings/branches": MapPin,
  "/settings/users": Users,
  "/settings/master-data/models": Package,
  "/settings/master-data/pullout-classifications": ArrowUpToLine,
  "/settings/master-data/sale-types": ShoppingCart,
};

export default async function SetupPage() {
  const session = await requireAuth();
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);

  if (
    !isTenantSetupAdmin({
      roleSlugs: session.user.roleSlugs,
      isPlatformOperator,
    })
  ) {
    redirect("/dashboard");
  }

  const cards = await getSetupReadiness(session.user.tenantId, session.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup"
        description="Company, people, places, and the lookup lists your teams need before they start work."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = CARD_ICONS[card.href] ?? Building2;
          const ready = card.status === "ready";
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{card.label}</p>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      ready
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {ready ? "Ready" : "Missing"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
              </div>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
