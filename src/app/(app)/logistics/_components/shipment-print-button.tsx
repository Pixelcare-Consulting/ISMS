"use client";

import { useState } from "react";

import { printShipmentDocument, type ShipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { Button } from "@/components/ui/button";
import { loadPrintLetterhead } from "@/features/settings/lib/load-print-letterhead";

export function ShipmentPrintButton({ document }: { document: ShipmentPrintDocument | null }) {
  const [pending, setPending] = useState(false);
  if (!document) return null;

  async function print(slip: ShipmentPrintDocument) {
    setPending(true);
    try {
      printShipmentDocument(slip, await loadPrintLetterhead());
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => void print(document)}>
      {pending ? "Preparing…" : "Print"}
    </Button>
  );
}
