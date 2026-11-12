"use client";

import { printShipmentDocument, type ShipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { Button } from "@/components/ui/button";

export function ShipmentPrintButton({ document }: { document: ShipmentPrintDocument | null }) {
  if (!document) return null;
  return (
    <Button type="button" variant="outline" onClick={() => printShipmentDocument(document)}>
      Print
    </Button>
  );
}
