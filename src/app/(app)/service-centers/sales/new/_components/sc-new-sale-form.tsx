"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { listScCentersForOpsAction } from "@/features/service-center-ops/actions/sc-inventory.actions";
import {
  createScSaleAction,
  listScStkSerialsAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

type CenterOption = Awaited<ReturnType<typeof listScCentersForOpsAction>>[number];

export function ScNewSaleForm({ centers }: { centers: CenterOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serviceCenterId, setServiceCenterId] = useState(centers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(
    centers[0]?.locations[0]?.id ?? "",
  );
  const [serialNumberId, setSerialNumberId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [amount, setAmount] = useState("0");
  const [reserved, setReserved] = useState(false);
  const [serialOptions, setSerialOptions] = useState<
    { id: string; label: string }[]
  >([]);

  const locations = useMemo(() => {
    const center = centers.find((c) => c.id === serviceCenterId);
    return (center?.locations ?? []).map((l) => ({
      id: l.id,
      label: `${l.name} (${l.code})`,
    }));
  }, [centers, serviceCenterId]);

  function loadSerials(centerId: string, locId: string) {
    setSerialNumberId("");
    if (!centerId || !locId) {
      setSerialOptions([]);
      return;
    }
    startTransition(async () => {
      const result = await listScStkSerialsAction(centerId, locId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        setSerialOptions([]);
        return;
      }
      const items = "items" in result ? result.items : undefined;
      setSerialOptions(
        (items ?? []).map((item) => ({
          id: item.serialNumberId,
          label: `${item.serialNo} · ${item.skuCode}`,
        })),
      );
    });
  }

  // Bootstrap STK list for the default center/location (handler-driven after that).
  // Deferred so we never sync setState during the effect body.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSerials(serviceCenterId, locationId);
    }, 0);
    return () => window.clearTimeout(timer);
    // Mount-only: center/location changes reload via onChange handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  function submit() {
    const parsedAmount = Number(amount);
    if (!serviceCenterId || !locationId || !serialNumberId) {
      toast.error("Select center, location, and serial");
      return;
    }
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    startTransition(async () => {
      const result = await createScSaleAction({
        serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberId,
        customerName: customerName.trim() || null,
        amount: parsedAmount,
        reserved,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Sale ${result.transactionNo} recorded`);
      router.push("/service-centers/sales");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border p-6">
      <SearchableSelect
        label="Service center"
        options={centers.map((c) => ({
          id: c.id,
          label: `${c.name} (${c.sapCode})`,
        }))}
        value={serviceCenterId}
        onChange={(id) => {
          setServiceCenterId(id);
          const center = centers.find((c) => c.id === id);
          const locId = center?.locations[0]?.id ?? "";
          setLocationId(locId);
          loadSerials(id, locId);
        }}
        placeholder="Select center…"
        searchPlaceholder="Search centers…"
        disabled={pending}
      />
      <SearchableSelect
        label="Location"
        options={locations}
        value={locationId}
        onChange={(id) => {
          setLocationId(id);
          loadSerials(serviceCenterId, id);
        }}
        placeholder="Select location…"
        searchPlaceholder="Search locations…"
        disabled={pending || !serviceCenterId}
      />
      <SearchableSelect
        label="Serial (STK)"
        options={serialOptions}
        value={serialNumberId}
        onChange={setSerialNumberId}
        placeholder={
          serialOptions.length ? "Select serial…" : "No STK serials here"
        }
        searchPlaceholder="Filter serials…"
        disabled={pending || serialOptions.length === 0}
      />
      <div className="space-y-2">
        <Label htmlFor="customerName">Customer name</Label>
        <Input
          id="customerName"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input
          id="amount"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={reserved}
          onCheckedChange={(checked) => setReserved(checked === true)}
          disabled={pending}
        />
        Reserve only (RSV instead of SLD)
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/service-centers/sales")}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Record sale"}
        </Button>
      </div>
    </div>
  );
}
