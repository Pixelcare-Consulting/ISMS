"use client";

import { ArrowLeftRight, Truck, Undo2, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { ModuleGuide } from "@/components/module-guide";
import { SectionLayout } from "@/components/navigation/section-layout";
import { resolveLogisticsModuleGuide } from "@/content/module-guides/logistics";
import { DELIVERIES_PAGE_TUTORIAL } from "@/content/page-tutorials/deliveries";
import { PULLOUTS_PAGE_TUTORIAL } from "@/content/page-tutorials/pullouts";
import { TRANSFERS_PAGE_TUTORIAL } from "@/content/page-tutorials/transfers";

function resolveLogisticsTutorial(pathname: string): PageTutorialContent {
  if (pathname.startsWith("/logistics/transfers")) {
    return TRANSFERS_PAGE_TUTORIAL;
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return PULLOUTS_PAGE_TUTORIAL;
  }
  return DELIVERIES_PAGE_TUTORIAL;
}

function resolveLogisticsDescription(pathname: string): string {
  if (pathname.startsWith("/logistics/delivery-transfers")) {
    return "Transfers of delivered units the branch did not accept.";
  }
  if (pathname.startsWith("/logistics/transfers")) {
    return "Inter-branch transfers of serialized stock.";
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return "Pull-outs from branch back through logistics to warehouse.";
  }
  return "Deliveries from approved orders, branch transfers, and pull-outs.";
}

function resolveLogisticsGuideIcon(pathname: string): LucideIcon {
  if (pathname.startsWith("/logistics/delivery-transfers")) {
    return ArrowLeftRight;
  }
  if (pathname.startsWith("/logistics/transfers")) {
    return ArrowLeftRight;
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return Undo2;
  }
  return Truck;
}

/** List pages are /logistics/{section}. A third segment is one record. */
function isLogisticsRecordDetail(pathname: string): boolean {
  const [root, section, id, extra] = pathname.split("/").filter(Boolean);
  if (root !== "logistics" || extra !== undefined || !section || !id) {
    return false;
  }
  switch (section) {
    case "deliveries":
    case "transfers":
    case "pickups":
    case "delivery-transfers":
      return true;
    default:
      return false;
  }
}

export function LogisticsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showModuleGuide = !isLogisticsRecordDetail(pathname);
  const guide = showModuleGuide ? resolveLogisticsModuleGuide(pathname) : null;
  const GuideIcon = showModuleGuide ? resolveLogisticsGuideIcon(pathname) : null;

  return (
    <SectionLayout
      title="Logistics"
      description={resolveLogisticsDescription(pathname)}
      tutorial={resolveLogisticsTutorial(pathname)}
    >
      <div className="space-y-6">
        {guide && GuideIcon ? (
          <ModuleGuide {...guide} icon={GuideIcon} resetKey={pathname} />
        ) : null}
        {children}
      </div>
    </SectionLayout>
  );
}
