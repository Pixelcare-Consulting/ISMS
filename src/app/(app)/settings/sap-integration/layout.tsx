import { SAP_INTEGRATION_TABS } from "@/config/section-tabs";
import { SectionLayout } from "@/components/navigation/section-layout";

export default function SapIntegrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="SAP integration"
      description="Configure SAP Business One Service Layer and monitor the outbound integration queue."
      tabs={SAP_INTEGRATION_TABS}
      tabsAriaLabel="SAP integration sections"
    >
      {children}
    </SectionLayout>
  );
}
