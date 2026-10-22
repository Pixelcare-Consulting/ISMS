"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { TransferForm } from "@/app/(app)/logistics/_components/transfer-form";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

export function TransferDetailView({
  detail,
  capabilities,
  branchScope,
}: {
  detail: TransferDetail;
  capabilities: LogisticsActionCapabilities;
  branchScope: string[] | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/logistics/transfers" className="text-sm text-muted-foreground hover:underline">
          Back to transfers
        </Link>
        <h2 className="text-xl font-semibold">{detail.transferNo}</h2>
      </div>
      <TransferForm
        mode="view"
        detail={detail}
        capabilities={capabilities}
        branchScope={branchScope}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
