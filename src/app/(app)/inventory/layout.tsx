import { SectionLayout } from "@/components/navigation/section-layout";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SectionLayout
      title="Inventory"
      description="Serialized branch stock and physical count sessions."
    >
      {children}
    </SectionLayout>
  );
}
