import { SectionLayout } from "@/components/navigation/section-layout";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="Reports"
      description="CSV exports aligned with BRS / xlsx report sheets."
    >
      {children}
    </SectionLayout>
  );
}
