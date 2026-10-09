import { notFound } from "next/navigation";

import { StockCountDetailPanel } from "@/app/(app)/inventory/stock-count/_components/stock-count-detail-panel";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";
import { requirePermission } from "@/lib/auth/permissions";

interface StockCountDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function StockCountDetailPage({
  params,
}: StockCountDetailPageProps) {
  const auth = await requirePermission("inventory.view");
  const { sessionId } = await params;
  // Load via service (not a nested server action) so the RSC always gets a
  // plain DTO; also backfills expected STK lines when the count opened empty.
  const session = await stockAuditService.getSessionDetail(
    auth.user.tenantId,
    sessionId,
  );
  if (!session) notFound();

  return <StockCountDetailPanel session={session} />;
}
