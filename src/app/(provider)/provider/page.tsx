import Link from "next/link";
import { Building2, CalendarPlus, ShieldOff, Users } from "lucide-react";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProviderSummaryAction } from "@/features/provider/actions/provider.actions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Provider overview");

export default async function ProviderOverviewPage() {
  const summary = await getProviderSummaryAction();

  const cards = [
    {
      label: "Active customers",
      value: summary.activeCustomers,
      icon: Building2,
      href: "/provider/tenants",
    },
    {
      label: "Disabled customers",
      value: summary.disabledCustomers,
      icon: ShieldOff,
      href: "/provider/tenants",
    },
    {
      label: "Customer users",
      value: summary.totalUsers,
      icon: Users,
      href: "/provider/tenants",
    },
    {
      label: "Created this month",
      value: summary.createdThisMonth,
      icon: CalendarPlus,
      href: "/provider/tenants",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform summary across customer organizations."
        sticky={false}
        actions={
          <Button asChild>
            <Link href="/provider/tenants">Manage tenants</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="block">
              <Card className="h-full transition-colors hover:bg-muted/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight">
                    {card.value}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
