import { PageHeader } from "@/app/(app)/_components/page-header";
import type { PageTutorialContent } from "@/components/page-tutorial/types";
import {
  RouteTabs,
  type RouteTabItem,
} from "@/components/navigation/route-tabs";

interface SectionLayoutProps {
  title: string;
  description?: string;
  tutorial?: PageTutorialContent;
  /** Omit when the top nav dropdown already lists the same routes. */
  tabs?: RouteTabItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  tabVariant?: "pill" | "underline";
  tabsAriaLabel?: string;
}

/**
 * Shared layout for multi-route sections: page header, optional route tabs, content.
 * Tab definitions live in `src/config/section-tabs.ts` (use only when not in header nav).
 */
export function SectionLayout({
  title,
  description,
  tutorial,
  tabs,
  actions,
  children,
  tabVariant = "pill",
  tabsAriaLabel,
}: SectionLayoutProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        tutorial={tutorial}
        actions={actions}
        sticky={false}
      />
      {tabs && tabs.length > 0 ? (
        <RouteTabs
          items={tabs}
          variant={tabVariant}
          aria-label={tabsAriaLabel ?? `${title} sections`}
        />
      ) : null}
      {children}
    </div>
  );
}
