import { LogisticsSectionLayout } from "@/app/(app)/logistics/_components/logistics-section-layout";

export default function LogisticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LogisticsSectionLayout>{children}</LogisticsSectionLayout>;
}
