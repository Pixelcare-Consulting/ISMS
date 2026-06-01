"use client";

import { useState } from "react";

import {
  listBranchesForLogisticsAction,
  listPulloutReasonCodesAction,
  listWarehousesForLogisticsAction,
} from "@/features/logistics/actions/logistics.actions";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
}

export function useLogisticsRefs() {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [pulloutReasons, setPulloutReasons] = useState<StatusCodeRef[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState("");

  async function loadRefs() {
    const [b, w, reasons] = await Promise.all([
      listBranchesForLogisticsAction(),
      listWarehousesForLogisticsAction(),
      listPulloutReasonCodesAction(),
    ]);
    setBranches(b);
    setWarehouses(w);
    setPulloutReasons(
      reasons.map((r: { id: string; code: string; name: string }) => ({
        id: r.id,
        code: r.code,
        name: r.name,
      })),
    );
    if (reasons[0]) setSelectedReasonId(reasons[0].id);
  }

  return {
    branches,
    warehouses,
    pulloutReasons,
    selectedReasonId,
    setSelectedReasonId,
    loadRefs,
  };
}
