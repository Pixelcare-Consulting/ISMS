import { notFound } from "next/navigation";

import { getStockCountSessionAction } from "@/features/stock-audit/actions/stock-audit.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { StockCountDetailPanel } from "@/app/(app)/inventory/stock-count/_components/stock-count-detail-panel";

interface StockCountDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function StockCountDetailPage({ params }: StockCountDetailPageProps) {
  await requirePermission("inventory.view");
  const { sessionId } = await params;
  const session = await getStockCountSessionAction(sessionId);
  if (!session) notFound();

  return <StockCountDetailPanel session={session} />;
}
