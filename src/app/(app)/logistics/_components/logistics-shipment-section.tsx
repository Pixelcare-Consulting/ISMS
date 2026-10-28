"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { printShipmentDocument, type ShipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { RecordField, RecordFieldGrid, RecordReadout, RecordSection } from "@/components/record-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatScheduleDate,
  scheduleDateInputValue,
  type LogisticsShipment,
} from "@/features/logistics/lib/shipment";

function textOrDash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || "—";
}

export function ShipmentPrintButton({ document }: { document: ShipmentPrintDocument | null }) {
  if (!document) return null;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        const opened = printShipmentDocument(document);
        if (!opened) toast.error("Allow pop-ups to print this document");
      }}
    >
      Print
    </Button>
  );
}

export function LogisticsShipmentSection({
  shipment,
  canEdit,
  onSave,
}: {
  shipment: LogisticsShipment;
  canEdit: boolean;
  onSave: (input: {
    waybillNo: string;
    courierName: string;
    scheduledAt: string;
  }) => Promise<{ error: string } | { success: true }>;
}) {
  const [pending, startTransition] = useTransition();
  const [waybillNo, setWaybillNo] = useState(shipment.waybillNo ?? "");
  const [courierName, setCourierName] = useState(shipment.courierName ?? "");
  const [scheduledAt, setScheduledAt] = useState(scheduleDateInputValue(shipment.scheduledAt));

  const dirty =
    waybillNo !== (shipment.waybillNo ?? "") ||
    courierName !== (shipment.courierName ?? "") ||
    scheduledAt !== scheduleDateInputValue(shipment.scheduledAt);

  function save() {
    startTransition(async () => {
      const result = await onSave({ waybillNo, courierName, scheduledAt });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Waybill and schedule saved");
    });
  }

  return (
    <RecordSection
      title="Waybill and scheduling"
      description="Waybill, courier or forwarder, and schedule date."
      divided
      action={
        canEdit && dirty ? (
          <Button type="button" disabled={pending} onClick={save}>
            Save
          </Button>
        ) : null
      }
    >
      <RecordFieldGrid>
        {canEdit ? (
          <>
            <RecordField label="Waybill" htmlFor="shipment-waybill">
              <Input
                id="shipment-waybill"
                value={waybillNo}
                disabled={pending}
                onChange={(event) => setWaybillNo(event.target.value)}
              />
            </RecordField>
            <RecordField label="Courier / forwarder" htmlFor="shipment-courier">
              <Input
                id="shipment-courier"
                value={courierName}
                disabled={pending}
                onChange={(event) => setCourierName(event.target.value)}
              />
            </RecordField>
            <RecordField label="Schedule date" htmlFor="shipment-date">
              <Input
                id="shipment-date"
                type="date"
                value={scheduledAt}
                disabled={pending}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </RecordField>
          </>
        ) : (
          <>
            <RecordReadout label="Waybill" value={textOrDash(shipment.waybillNo)} />
            <RecordReadout label="Courier / forwarder" value={textOrDash(shipment.courierName)} />
            <RecordReadout label="Schedule date" value={formatScheduleDate(shipment.scheduledAt)} />
          </>
        )}
        {shipment.scheduledByName ? (
          <RecordReadout label="Scheduled by" value={shipment.scheduledByName} />
        ) : null}
      </RecordFieldGrid>
    </RecordSection>
  );
}
