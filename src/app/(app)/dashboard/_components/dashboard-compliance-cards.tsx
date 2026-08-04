import Link from "next/link";
import {
  BookOpen,
  FileBarChart,
  Megaphone,
  Store,
} from "lucide-react";
import type { ReactNode } from "react";

import type { DashboardComplianceCard } from "@/features/dashboard/lib/build-dashboard-view-model";

interface DashboardComplianceCardsProps {
  cards: DashboardComplianceCard[];
}

const CARD_ICONS: Record<string, ReactNode> = {
  policies: <BookOpen className="size-4" />,
  reports: <FileBarChart className="size-4" />,
  announcements: <Megaphone className="size-4" />,
  competitors: <Store className="size-4" />,
};

export function DashboardComplianceCards({ cards }: DashboardComplianceCardsProps) {
  if (cards.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Compliance overview</h2>
        <p className="text-xs text-muted-foreground">
          Jump into the modules available for your role
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <li key={card.key}>
            <Link
              href={card.href}
              className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="text-muted-foreground">
                  {CARD_ICONS[card.key] ?? null}
                </span>
                {card.title}
              </span>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
