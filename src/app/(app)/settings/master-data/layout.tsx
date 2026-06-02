import { MASTER_DATA_TABS } from "@/config/section-tabs";
import { SectionLayout } from "@/components/navigation/section-layout";

export default function MasterDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="Master data"
      description="Brands, categories, and product models for planograms and orders."
      tabs={MASTER_DATA_TABS}
      tabsAriaLabel="Master data sections"
    >
      {children}
    </SectionLayout>
  );
}
