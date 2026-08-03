import { ReportsSectionLayout } from "@/app/(app)/reports/_components/reports-section-layout";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReportsSectionLayout>{children}</ReportsSectionLayout>;
}
