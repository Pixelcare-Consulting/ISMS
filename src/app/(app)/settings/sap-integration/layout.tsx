import { PLATFORM_OPERATOR_NAME } from "@/config/platform";
import { SectionLayout } from "@/components/navigation/section-layout";

export default function SapIntegrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="SAP integration"
      // description={`See what has been sent to SAP Business One. ${PLATFORM_OPERATOR_NAME} keeps the connection.`}
      description={`See what has been sent to SAP Business One.`}
    >
      {children}
    </SectionLayout>
  );
}
