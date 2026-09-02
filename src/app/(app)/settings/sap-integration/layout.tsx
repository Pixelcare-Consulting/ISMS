import { PLATFORM_OPERATOR_NAME } from "@/config/platform";
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
      description={`Monitor the outbound SAP Business One integration queue. The Service Layer connection itself is set up and maintained by ${PLATFORM_OPERATOR_NAME}.`}
      tabs={SAP_INTEGRATION_TABS}
      tabsAriaLabel="SAP integration sections"
    >
      {children}
    </SectionLayout>
  );
}
