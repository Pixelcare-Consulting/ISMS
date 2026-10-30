"use client";

import { useEffect, useState } from "react";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { getScOrderSetupAction } from "@/features/service-center-ordering/actions/sc-ordering-settings.actions";
import { SC_ORDERING_NOT_SET_UP } from "@/features/service-center-ordering/constants";
import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";

export type OrderFor = "branch" | "service_center";

export const ORDER_FOR_LABELS: Record<OrderFor, string> = {
  branch: "Branch",
  service_center: "Service center",
};

/** A branch order's setup, or a service-center order's. */
export type OrderSetupChoice =
  | {
      orderFor: "branch";
      /** Empty for outright: the SO bills the branch's BP Code, not a dealer. */
      dealerId: string;
      branchId: string;
      orderType: "manual" | "special";
      modeOfPaymentId: string;
    }
  | { orderFor: "service_center"; serviceCenterId: string; cardCode: string };

export type BranchOrderSetupChoice = Extract<OrderSetupChoice, { orderFor: "branch" }>;

/** The create page URL that opens straight on the order for `choice`. */
export function orderSetupHref(choice: OrderSetupChoice): string {
  const params = new URLSearchParams();
  if (choice.orderFor === "service_center") {
    params.set("for", "service_center");
    params.set("serviceCenterId", choice.serviceCenterId);
    params.set("cardCode", choice.cardCode);
  } else {
    params.set("type", choice.orderType);
    if (choice.dealerId) params.set("dealerId", choice.dealerId);
    params.set("branchId", choice.branchId);
    if (choice.modeOfPaymentId) params.set("modeOfPaymentId", choice.modeOfPaymentId);
  }
  params.set("ready", "1");
  return `/orders/manual/new?${params.toString()}`;
}

type Setup = Awaited<ReturnType<typeof getScOrderSetupAction>>;
type CenterRow = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

/** Why a service-center order can't be set up yet, or null. */
export function scOrderSetupBlock(setup: Setup | null): string | null {
  if (!setup) return null;
  if (setup.customers.length === 0 || !setup.defaults.warehouseCode) return SC_ORDERING_NOT_SET_UP;
  return null;
}

/** Service centers in the user's scope plus the ordering customers, loaded while `enabled`. */
export function useScOrderSetup(enabled: boolean) {
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [setup, setSetup] = useState<Setup | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([listScCentersForOpsAction(), getScOrderSetupAction()]).then(
      ([centerRows, setupData]) => {
        if (cancelled) return;
        setCenters(centerRows);
        setSetup(setupData);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { loaded: setup !== null, centers, setup };
}

export function ServiceCenterSetupFields({
  centers,
  setup,
  serviceCenterId,
  cardCode,
  onServiceCenterChange,
  onCardCodeChange,
}: {
  centers: CenterRow[];
  setup: Setup;
  serviceCenterId: string;
  /** Empty means the primary customer. */
  cardCode: string;
  onServiceCenterChange: (id: string) => void;
  onCardCodeChange: (code: string) => void;
}) {
  const block = scOrderSetupBlock(setup);
  if (block) {
    return (
      <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {block}
      </p>
    );
  }
  const primary = setup.customers.find((customer) => customer.isPrimary)?.cardCode ?? "";
  return (
    <>
      <SearchableSelect
        label="Service center"
        className="w-full"
        options={centers.map((center) => ({
          id: center.id,
          label: center.name,
          description: center.sapCode,
        }))}
        value={serviceCenterId}
        onChange={onServiceCenterChange}
        placeholder="Select service center…"
        searchPlaceholder="Search service centers…"
        emptyMessage="No active service centers you can order for."
      />
      <SearchableSelect
        label="Customer (SAP)"
        className="w-full"
        options={setup.customers.map((customer) => ({
          id: customer.cardCode,
          label: customer.cardCode,
          description: [customer.cardName, customer.isPrimary ? "Primary" : null]
            .filter(Boolean)
            .join(" · "),
        }))}
        value={cardCode || primary}
        onChange={onCardCodeChange}
        placeholder="Select customer…"
        searchPlaceholder="Search customers…"
      />
    </>
  );
}
