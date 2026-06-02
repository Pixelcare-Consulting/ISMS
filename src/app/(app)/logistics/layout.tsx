import { SectionLayout } from "@/components/navigation/section-layout";

export default function LogisticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="Logistics"
      description="Deliveries from approved orders, branch transfers, and pull-outs."
    >
      {children}
    </SectionLayout>
  );
}
