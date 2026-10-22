"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createDeliveryTransferAction,
  prepareDeliveryTransferAction,
} from "@/features/logistics/actions/logistics.actions";
import type { DeliveryReceiptLine } from "@/features/logistics/services/delivery-posting.service";
import type { TransferPlace } from "@/features/logistics/services/delivery-transfer.planner";
import type { DeliveryTransferDraft } from "@/features/logistics/services/delivery-transfer.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

export interface TransferRequest {
  deliveryId: string;
  deliveryNo: string;
  units: DeliveryReceiptLine[];
}

interface DeliveryTransferCreateDialogProps {
  request: TransferRequest | null;
  onClose: () => void;
}

/**
 * Create a unit transfer for delivered units the branch did not accept.
 * Branch release is fixed to the delivery branch, where the units sit in
 * transit. Branch receive takes a branch or a warehouse; a warehouse also
 * needs a location.
 */
export function DeliveryTransferCreateDialog({ request, onClose }: DeliveryTransferCreateDialogProps) {
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        {request ? <CreateBody key={request.units.map((u) => u.serialNumberId).join(",")} request={request} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; draft: DeliveryTransferDraft; createdByName: string };

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

/** Option ids carry the kind so one picker can list branches and warehouses. */
function placeKey(place: TransferPlace | null): string {
  if (!place) return "";
  return place.kind === "BRANCH" ? `BRANCH:${place.branchId}` : `WAREHOUSE:${place.warehouseId}`;
}

function parsePlaceKey(key: string): { kind: "BRANCH" | "WAREHOUSE"; id: string } | null {
  const [kind, id] = key.split(":");
  if ((kind !== "BRANCH" && kind !== "WAREHOUSE") || !id) return null;
  return { kind, id };
}

function CreateBody({ request, onClose }: { request: TransferRequest; onClose: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [receiveKey, setReceiveKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  // Units on this draft. Delete drops one before saving; at least one must stay.
  const [units, setUnits] = useState(request.units);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    prepareDeliveryTransferAction(
      request.deliveryId,
      request.units.map((unit) => unit.serialNumberId),
    ).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setState({ kind: "error", message: result.error });
        return;
      }
      const { defaults } = result.draft;
      setState({ kind: "ready", draft: result.draft, createdByName: result.createdByName });
      setReceiveKey(placeKey(defaults.receive));
      setLocationId(defaults.receive?.kind === "WAREHOUSE" ? defaults.receive.warehouseLocationId : "");
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const draft = state.kind === "ready" ? state.draft : null;

  const placeOptions = useMemo<SearchableOption[]>(() => {
    if (!draft) return [];
    return [
      ...draft.places.branches.map((branch) => ({
        id: `BRANCH:${branch.id}`,
        label: `Branch · ${branch.name}`,
        description: branch.sapCode,
      })),
      ...draft.places.warehouses.map((warehouse) => ({
        id: `WAREHOUSE:${warehouse.id}`,
        label: `Warehouse · ${warehouse.name}`,
        description: warehouse.code,
      })),
    ];
  }, [draft]);

  const receive = parsePlaceKey(receiveKey);
  const receiveWarehouse =
    receive?.kind === "WAREHOUSE" ? draft?.places.warehouses.find((w) => w.id === receive.id) : undefined;
  const locationOptions = useMemo<SearchableOption[]>(
    () =>
      (receiveWarehouse?.locations ?? []).map((location) => ({
        id: location.id,
        label: location.code,
        description: location.name,
      })),
    [receiveWarehouse],
  );

  const release = draft?.defaults.release.kind === "BRANCH" ? draft.defaults.release : null;
  const missing = !receive
    ? "Choose the branch receive."
    : receive.kind === "WAREHOUSE" && !locationId
      ? "Choose the warehouse location."
      : null;

  function changeReceive(next: string) {
    setReceiveKey(next);
    const parsed = parsePlaceKey(next);
    const defaults = draft?.defaults.receive;
    // Keep the dispatch location only when the user returns to the source warehouse.
    setLocationId(
      parsed?.kind === "WAREHOUSE" && defaults?.kind === "WAREHOUSE" && defaults.warehouseId === parsed.id
        ? defaults.warehouseLocationId
        : "",
    );
  }

  function submit() {
    if (!release || !receive || missing) return;
    startTransition(async () => {
      const result = await createDeliveryTransferAction({
        deliveryId: request.deliveryId,
        release: { kind: "BRANCH", id: release.branchId },
        receive:
          receive.kind === "WAREHOUSE"
            ? { kind: "WAREHOUSE", id: receive.id, locationId }
            : { kind: "BRANCH", id: receive.id },
        lines: units.map((unit) => ({
          serialNumberId: unit.serialNumberId,
          remarks: remarks[unit.serialNumberId]?.trim() || null,
        })),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created ${result.transferNo}. It now needs approval.`);
      onClose();
      router.push(`/logistics/delivery-transfers/${result.id}`);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Branch transfer</DialogTitle>
        <DialogDescription>
          Units from delivery {request.deliveryNo} that were not accepted. They stay in transit until
          the transfer is approved, released and received.
        </DialogDescription>
      </DialogHeader>

      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading branches and warehouses…
        </p>
      ) : state.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : (
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <section aria-label="Transfer header" className="rounded-lg border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <dl className="space-y-3">
                <HeaderField label="Transfer No.">
                  <span className="text-muted-foreground">Assigned when saved</span>
                </HeaderField>
                <HeaderField label="Created by">{state.createdByName}</HeaderField>
                <HeaderField label="Created date">{dateFormat.format(new Date())}</HeaderField>
              </dl>
              <dl className="space-y-3">
                <HeaderField label="Branch release">
                  {state.draft.releaseName}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Where the delivery went. Fixed.
                  </span>
                </HeaderField>
                <div className="space-y-2">
                  <SearchableSelect
                    id="unit-transfer-receive"
                    label="Branch receive"
                    options={placeOptions}
                    value={receiveKey}
                    onChange={changeReceive}
                    placeholder="Select branch or warehouse…"
                    searchPlaceholder="Search branches and warehouses…"
                    disabled={pending}
                  />
                  {receive?.kind === "WAREHOUSE" ? (
                    <SearchableSelect
                      id="unit-transfer-location"
                      label="Warehouse location"
                      options={locationOptions}
                      value={locationId}
                      onChange={setLocationId}
                      placeholder="Select location…"
                      searchPlaceholder="Search locations…"
                      emptyMessage="This warehouse has no locations."
                      disabled={pending}
                    />
                  ) : null}
                </div>
                <HeaderField label="Transfer status">
                  <span className="text-muted-foreground">New. Pending approval once saved.</span>
                </HeaderField>
              </dl>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Transfer details</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Model</th>
                    <th scope="col" className="px-3 py-2 font-medium">Serial number</th>
                    <th scope="col" className="px-3 py-2 font-medium">Remarks</th>
                    <th scope="col" className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr key={unit.serialNumberId} className="border-t align-middle">
                      <td className="px-3 py-2">
                        <span className="font-medium">{unit.skuCode}</span>
                        <span className="block text-xs text-muted-foreground">{unit.modelName}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">{unit.serialNo}</td>
                      <td className="px-3 py-2">
                        <Input
                          aria-label={`Remarks for ${unit.serialNo}`}
                          value={remarks[unit.serialNumberId] ?? ""}
                          maxLength={500}
                          placeholder="For example: screen cracked"
                          disabled={pending}
                          className="h-9 max-sm:h-11"
                          onChange={(event) =>
                            setRemarks((current) => ({
                              ...current,
                              [unit.serialNumberId]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="max-sm:h-11 hover:border-destructive hover:text-destructive"
                          disabled={pending || units.length === 1}
                          title={units.length === 1 ? "A transfer needs at least one unit." : undefined}
                          onClick={() =>
                            setUnits((current) =>
                              current.filter((row) => row.serialNumberId !== unit.serialNumberId),
                            )
                          }
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Approve and accept are done per line on the transfer after it is saved.
            </p>
          </section>
          {missing ? <p className="text-xs text-muted-foreground">{missing}</p> : null}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="max-sm:h-11"
          disabled={pending || state.kind !== "ready" || missing !== null}
          onClick={submit}
        >
          {pending ? "Saving…" : "Save transfer"}
        </Button>
      </DialogFooter>
    </>
  );
}

function HeaderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
