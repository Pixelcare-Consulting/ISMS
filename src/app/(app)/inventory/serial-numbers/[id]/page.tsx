import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getSerialTraceabilityAction } from "@/features/serial-numbers/actions/serial-number.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { Button } from "@/components/ui/button";
import { SerialTimeline } from "@/app/(app)/inventory/serial-numbers/[id]/_components/serial-timeline";

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Serial ${serial.serialNo}`}
        description="Full lifecycle traceability for this serialized unit."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory/serial-numbers">
              <ArrowLeft className="size-4" /> All serials
            </Link>
          </Button>
        }
      />
      <SerialTimeline serial={serial} />
    </div>
  );
}
