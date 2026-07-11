import { InventorySectionLayout } from "@/app/(app)/inventory/_components/inventory-section-layout";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <InventorySectionLayout>{children}</InventorySectionLayout>;
}
