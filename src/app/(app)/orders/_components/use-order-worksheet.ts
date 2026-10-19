"use client";

import { useEffect, useState } from "react";

import { getOrderWorksheetAction } from "@/features/orders/actions/order-worksheet.actions";
import type { OrderWorksheetPayload } from "@/features/orders/types/order-analytics";
import type { BranchOrderType } from "@prisma/client";

export function useOrderWorksheet(input: {
  enabled: boolean;
  branchId: string;
  orderType: BranchOrderType;
  existingModelIds: readonly string[];
  excludeOrderId?: string | null;
}) {
  const [payload, setPayload] = useState<OrderWorksheetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const idsKey = [...input.existingModelIds].filter(Boolean).sort().join("\n");
  const requestKey = [
    input.enabled ? "1" : "0",
    input.branchId,
    input.orderType,
    idsKey,
    input.excludeOrderId ?? "",
  ].join("|");

  useEffect(() => {
    if (!input.enabled || !input.branchId) return;
    let cancelled = false;
    const key = requestKey;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      const result = await getOrderWorksheetAction({
        branchId: input.branchId,
        orderType: input.orderType,
        existingModelIds: idsKey ? idsKey.split("\n") : [],
        excludeOrderId: input.excludeOrderId ?? null,
      });
      if (cancelled) return;
      if ("error" in result) {
        setPayload(null);
        setError(result.error ?? "Failed to load order worksheet");
      } else {
        setPayload(result.data);
        setError(null);
      }
      setLoadedKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey, input.branchId, input.enabled, input.excludeOrderId, input.orderType, requestKey]);

  const active = input.enabled && input.branchId.length > 0;
  const ready = active && loadedKey === requestKey;
  return {
    payload: ready ? payload : null,
    loading: active && !ready,
    error: ready ? error : null,
  };
}
