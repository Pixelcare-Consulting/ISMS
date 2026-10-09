import { notFound } from "next/navigation";

import { getSerialTraceabilityAction } from "@/features/serial-numbers/actions/serial-number.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SerialDetailView } from "@/app/(app)/inventory/serial-numbers/[id]/_components/serial-detail-view";

interface SerialTraceabilityPageProps {
  params: Promise<{ id: string }>;
}

export default async function SerialTraceabilityPage({
  params,
}: SerialTraceabilityPageProps) {
  await requirePermission("inventory.view");
  const { id } = await params;
  const serial = await getSerialTraceabilityAction(id);
  if (!serial) {
    notFound();
  }

  return <SerialDetailView serial={serial} />;
}
