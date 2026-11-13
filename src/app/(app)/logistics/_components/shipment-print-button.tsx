"use client";

import { useState } from "react";

import { printShipmentDocument, type ShipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { printSlips, type SlipDocument } from "@/app/(app)/logistics/_components/slip-print";
import { Button } from "@/components/ui/button";
import { loadPrintLetterhead } from "@/features/settings/lib/load-print-letterhead";
import type { PrintLetterhead } from "@/utils/print-document";

/** Loads the company letterhead, then prints. Hidden while there is nothing to print. */
export function LetterheadPrintButton({ print }: { print: ((letterhead: PrintLetterhead | null) => void) | null }) {
  const [pending, setPending] = useState(false);
  if (!print) return null;

  async function run(printWith: (letterhead: PrintLetterhead | null) => void) {
    setPending(true);
    try {
      printWith(await loadPrintLetterhead());
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => void run(print)}>
      {pending ? "Preparing…" : "Print"}
    </Button>
  );
}

export function ShipmentPrintButton({ document }: { document: ShipmentPrintDocument | null }) {
  return (
    <LetterheadPrintButton print={document ? (letterhead) => printShipmentDocument(document, letterhead) : null} />
  );
}

export function SlipPrintButton({ slips }: { slips: readonly SlipDocument[] | null }) {
  return (
    <LetterheadPrintButton print={slips?.length ? (letterhead) => printSlips(slips, letterhead) : null} />
  );
}
