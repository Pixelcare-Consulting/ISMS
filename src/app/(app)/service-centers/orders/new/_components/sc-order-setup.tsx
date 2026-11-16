"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getScOrderSetupAction } from "@/features/service-center-ordering/actions/sc-ordering-settings.actions";
import { SC_ORDERING_NOT_SET_UP } from "@/features/service-center-ordering/constants";
import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";

export const SC_ORDERS_HREF = "/service-centers/orders";
export const SC_NEW_ORDER_HREF = "/service-centers/orders/new";

/** Who a service-center order is for: the center, and the SAP customer the Sales Order bills. */
export interface ScOrderSetupChoice {
  serviceCenterId: string;
  cardCode: string;
}

/** The create page URL that opens straight on the order for `choice`. */
export function scOrderSetupHref(choice: ScOrderSetupChoice): string {
  const params = new URLSearchParams({
    serviceCenterId: choice.serviceCenterId,
    cardCode: choice.cardCode,
    ready: "1",
  });
  return `${SC_NEW_ORDER_HREF}?${params.toString()}`;
}

export type ScOrderSetup = Awaited<ReturnType<typeof getScOrderSetupAction>>;
export type ScCenterRow = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

/** Why a service-center order can't be set up yet, or null. */
export function scOrderSetupBlock(setup: ScOrderSetup | null): string | null {
  if (!setup) return null;
  if (setup.customers.length === 0 || !setup.defaults.warehouseCode) return SC_ORDERING_NOT_SET_UP;
  return null;
}

/** Service centers in the user's scope plus the ordering customers, loaded while `enabled`. */
export function useScOrderSetup(enabled: boolean) {
  const [centers, setCenters] = useState<ScCenterRow[]>([]);
  const [setup, setSetup] = useState<ScOrderSetup | null>(null);

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
  centers: ScCenterRow[];
  setup: ScOrderSetup;
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

/** The setup popup for a service-center order: the center and the SAP customer it bills. */
export function ScOrderSetupDialog({
  open,
  centers,
  setup,
  initialServiceCenterId = "",
  initialCardCode = "",
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  centers: ScCenterRow[];
  /** Null while loading. */
  setup: ScOrderSetup | null;
  initialServiceCenterId?: string;
  initialCardCode?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (choice: ScOrderSetupChoice) => void;
}) {
  const wasOpen = useRef(false);
  const [serviceCenterId, setServiceCenterId] = useState(initialServiceCenterId);
  const [cardCode, setCardCode] = useState(initialCardCode);

  // Each opening starts from the order's current setup, not the last unconfirmed edit.
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setServiceCenterId(initialServiceCenterId);
    setCardCode(initialCardCode);
  }, [initialCardCode, initialServiceCenterId, open]);

  const primary = setup?.customers.find((customer) => customer.isPrimary)?.cardCode ?? "";
  const chosenCardCode = cardCode || primary;
  const canContinue =
    setup !== null &&
    scOrderSetupBlock(setup) === null &&
    Boolean(serviceCenterId && chosenCardCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create service center order</DialogTitle>
          <DialogDescription>
            Choose the service center and the SAP customer the Sales Order bills.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {setup ? (
            <ServiceCenterSetupFields
              centers={centers}
              setup={setup}
              serviceCenterId={serviceCenterId}
              cardCode={cardCode}
              onServiceCenterChange={setServiceCenterId}
              onCardCodeChange={setCardCode}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading service centers…</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canContinue}
            onClick={() => onContinue({ serviceCenterId, cardCode: chosenCardCode })}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
