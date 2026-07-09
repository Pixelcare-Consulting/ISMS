import type { LookupRecordStatus } from "@prisma/client";

import {
  listSerialModelOptionsAction,
  listSerialNumbersAction,
} from "@/features/serial-numbers/actions/serial-number.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { SerialNumberTable } from "@/app/(app)/inventory/serial-numbers/_components/serial-number-table";

interface SerialNumbersPageProps {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
  }>;
}

function parseStatus(value?: string): LookupRecordStatus | undefined {
  return value === "active" || value === "inactive" ? value : undefined;
}

export default async function SerialNumbersPage({
  searchParams,
}: SerialNumbersPageProps) {
  const session = await requirePermission("inventory.view");
  const canManage = session.user.permissions?.includes("inventory.manage") ?? false;

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = parseStatus(params.status);

  const [result, modelOptions] = await Promise.all([
    listSerialNumbersAction({ page, q: params.q, status }),
    canManage ? listSerialModelOptionsAction() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Every serialized unit in your organization. Open a serial to trace its
        full lifecycle across inventory, transfers, sales, pull-outs, and counts.
      </SectionPageLead>
      <SerialNumberTable
        result={result}
        modelOptions={modelOptions}
        canManage={canManage}
        currentSearch={params.q}
        currentStatus={status}
      />
    </div>
  );
}
