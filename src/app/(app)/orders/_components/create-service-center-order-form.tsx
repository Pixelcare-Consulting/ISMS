"use client";

import { ChevronLeft, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { AdditionalItemDialog } from "@/app/(app)/orders/_components/additional-item-dialog";
import { CreateOrderSetupDialog } from "@/app/(app)/orders/_components/create-order-form";
import {
  orderSetupHref,
  useScOrderSetup,
} from "@/app/(app)/orders/_components/service-center-order-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingModal } from "@/components/ui/loading-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { MODE_OF_PAYMENT_KIND_LABELS } from "@/features/lookups/constants/mode-of-payment-kind";
import { listSapProjectsForScOrderAction } from "@/features/service-center-ordering/actions/sc-ordering-settings.actions";
import {
  SC_ORDER_PO_NUMBER_MAX,
  SC_ORDERING_DEFAULT_LABELS,
  type ScOrderingDefaultKey,
} from "@/features/service-center-ordering/constants";
import {
  createScOrderAction,
  listScOrderCatalogAction,
} from "@/features/service-center-ops/actions/sc-orders.actions";

const SC_ORDERS_HREF = "/service-centers/orders";
const DEFAULT_KEYS = Object.keys(
  SC_ORDERING_DEFAULT_LABELS,
) as ScOrderingDefaultKey[];
const BLOCK_CLASS =
  "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive";

type CatalogModel = Awaited<
  ReturnType<typeof listScOrderCatalogAction>
>[number];

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 min-h-10 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

/**
 * The Create Order page for a service center: same setup popup and layout as a branch
 * order, but it bills a service-center customer, posts with the Settings defaults, and
 * takes any active model since a service center has no shelf plan.
 */
export function CreateServiceCenterOrderForm({
  serviceCenterId,
  cardCode,
  canCreateManual,
  canCreateSpecial,
}: {
  serviceCenterId: string;
  cardCode: string;
  canCreateManual: boolean;
  canCreateSpecial: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { centers, setup } = useScOrderSetup(true);
  // A direct visit has no service center yet: start in the setup popup, like a branch order.
  const ready = Boolean(serviceCenterId);
  const [setupOpen, setSetupOpen] = useState(!ready);
  const [locationId, setLocationId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [notes, setNotes] = useState("");
  const [projects, setProjects] = useState<
    { code: string; name: string | null }[] | null
  >(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [lines, setLines] = useState<{ modelId: string; quantity: number }[]>(
    [],
  );
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listSapProjectsForScOrderAction(),
      listScOrderCatalogAction(),
    ]).then(([projectResult, models]) => {
      if (cancelled) return;
      if ("error" in projectResult) {
        setProjectsError(projectResult.error ?? "Failed to load SAP projects");
        setProjects([]);
      } else {
        setProjects(projectResult.data);
      }
      setCatalog(models);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const center = centers.find((row) => row.id === serviceCenterId) ?? null;
  const customer =
    setup?.customers.find((row) => row.cardCode === cardCode) ?? null;
  const modelById = useMemo(
    () => new Map(catalog.map((model) => [model.id, model])),
    [catalog],
  );
  const addable = useMemo(() => {
    const onOrder = new Set(lines.map((line) => line.modelId));
    return catalog.filter((model) => !onOrder.has(model.id));
  }, [catalog, lines]);

  const setupBlock = !setup
    ? null
    : !center
      ? "This service center is not available to you. Choose another with Change."
      : !customer
        ? `${cardCode || "No customer"} is not a service center ordering customer. Choose another with Change.`
        : null;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const submitDisabled =
    pending ||
    !ready ||
    !setup ||
    setupBlock !== null ||
    lines.length === 0 ||
    lines.some((l) => l.quantity < 1);

  function addModels(ids: string[]) {
    setLines((prev) => [
      ...prev,
      ...ids.map((modelId) => ({ modelId, quantity: 1 })),
    ]);
  }

  function setQuantity(modelId: string, quantity: number) {
    const value = Number.isFinite(quantity)
      ? Math.max(0, Math.floor(quantity))
      : 0;
    setLines((prev) =>
      prev.map((line) =>
        line.modelId === modelId ? { ...line, quantity: value } : line,
      ),
    );
  }

  function submit() {
    if (submitDisabled) return;
    startTransition(async () => {
      const result = await createScOrderAction({
        serviceCenterId,
        serviceCenterLocationId: locationId || null,
        cardCode,
        poNumber: poNumber.trim() || null,
        projectCode: projectCode || null,
        notes: notes.trim() || null,
        lines,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Order ${result.orderNumber} submitted for approval`);
      router.push(SC_ORDERS_HREF);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-xl bg-sidebar px-5 py-5 text-sidebar-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Create service center order
          </h1>
          <p className="mt-1 text-sm text-sidebar-muted">
            Becomes a SAP Sales Order when it is approved.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-sidebar-accent px-3.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
            disabled={pending}
            onClick={() => router.push(SC_ORDERS_HREF)}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back to orders
          </button>
          <Button type="button" disabled={submitDisabled} onClick={submit}>
            Submit
          </Button>
        </div>
      </header>
      {ready ? (
        <div className="rounded-xl border border-border/70 bg-card shadow-sm">
          <div className="space-y-8 p-5 sm:p-6">
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">
                    Order
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The service center, who SAP bills, and the SAP codes on
                    every line.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setSetupOpen(true)}
                >
                  Change
                </Button>
              </div>
              {!setup ? (
                <p className="text-sm text-muted-foreground">
                  Loading order details…
                </p>
              ) : (
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <Readout
                    label="Service center"
                    value={center ? `${center.name} (${center.sapCode})` : "—"}
                  />
                  <Readout
                    label="Customer (SAP)"
                    value={
                      customer
                        ? [customer.cardCode, customer.cardName]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"
                    }
                  />
                  {DEFAULT_KEYS.map((key) => (
                    <Readout
                      key={key}
                      label={SC_ORDERING_DEFAULT_LABELS[key]}
                      value={setup.defaults[key] ?? "Not set"}
                    />
                  ))}
                  <Readout
                    label="Business type"
                    value={MODE_OF_PAYMENT_KIND_LABELS.OUTRIGHT}
                  />
                  {center && center.locations.length > 0 ? (
                    <SearchableSelect
                      label="Location"
                      className="w-full"
                      options={center.locations.map((location) => ({
                        id: location.id,
                        label: location.name,
                        description: location.code,
                      }))}
                      value={locationId}
                      onChange={setLocationId}
                      allowClear
                      placeholder="Optional"
                      searchPlaceholder="Search locations…"
                    />
                  ) : null}
                  <div className="min-w-0 space-y-1.5">
                    <label
                      htmlFor="sc-order-po"
                      className="text-sm text-muted-foreground"
                    >
                      PO number
                    </label>
                    <Input
                      id="sc-order-po"
                      value={poNumber}
                      maxLength={SC_ORDER_PO_NUMBER_MAX}
                      placeholder="Optional"
                      onChange={(event) => setPoNumber(event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <SearchableSelect
                      label="Project (SAP)"
                      className="w-full"
                      options={(projects ?? []).map((project) => ({
                        id: project.code,
                        label: project.code,
                        description: project.name ?? undefined,
                      }))}
                      value={projectCode}
                      onChange={setProjectCode}
                      allowClear
                      disabled={projects === null || pending}
                      placeholder={
                        projects === null ? "Loading SAP projects…" : "Optional"
                      }
                      searchPlaceholder="Search projects…"
                      emptyMessage="SAP has no active projects."
                    />
                    {projectsError ? (
                      <p className="text-xs text-destructive">
                        {projectsError}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label
                      htmlFor="sc-order-note"
                      className="text-sm text-muted-foreground"
                    >
                      Note for this order
                    </label>
                    <Textarea
                      id="sc-order-note"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional"
                      rows={3}
                      maxLength={500}
                      className="mt-1.5 min-h-24 resize-none rounded-lg border-transparent bg-muted/70 shadow-none"
                      disabled={pending}
                    />
                  </div>
                </div>
              )}
              {setupBlock ? <p className={BLOCK_CLASS}>{setupBlock}</p> : null}
            </section>
            <section className="space-y-4 border-t border-border/70 pt-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Models
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add the models this service center needs and enter a
                    quantity for each.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || catalog.length === 0}
                  onClick={() => setAddOpen(true)}
                >
                  Add models
                </Button>
              </div>
              {lines.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No models yet. Use Add models to pick them.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="w-32 px-3 py-2 font-medium">Quantity</th>
                        <th className="w-12 px-3 py-2" aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line) => {
                        const model = modelById.get(line.modelId);
                        return (
                          <tr key={line.modelId}>
                            <td className="px-3 py-2 font-medium">
                              {model?.skuCode ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {model?.name ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={line.quantity}
                                aria-label={`Quantity for ${model?.skuCode ?? "model"}`}
                                onChange={(event) =>
                                  setQuantity(
                                    line.modelId,
                                    event.target.valueAsNumber,
                                  )
                                }
                                disabled={pending}
                                className="h-9 tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${model?.skuCode ?? "model"}`}
                                disabled={pending}
                                onClick={() =>
                                  setLines((prev) =>
                                    prev.filter(
                                      (row) => row.modelId !== line.modelId,
                                    ),
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {lines.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {lines.length.toLocaleString()} models ·{" "}
                  {totalQuantity.toLocaleString()} units
                </p>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
      {addOpen ? (
        <AdditionalItemDialog
          open
          models={addable}
          title="Add models"
          description="Search active models that are not already on this order."
          onOpenChange={setAddOpen}
          onAdd={addModels}
        />
      ) : null}
      <CreateOrderSetupDialog
        open={setupOpen}
        canCreateManual={canCreateManual}
        canCreateSpecial={canCreateSpecial}
        canCreateServiceCenter
        initialOrderFor="service_center"
        initialType={canCreateManual ? "manual" : "special"}
        initialServiceCenterId={serviceCenterId}
        initialCardCode={cardCode}
        onOpenChange={(open) => {
          if (!open && !ready) {
            router.push(SC_ORDERS_HREF);
            return;
          }
          setSetupOpen(open);
        }}
        onContinue={(choice) => {
          setSetupOpen(false);
          if (
            lines.length > 0 &&
            !confirm(
              "Changing the order setup clears the models on this order. Continue?",
            )
          ) {
            return;
          }
          router.push(orderSetupHref(choice));
        }}
      />
      <LoadingModal
        open={pending}
        variant="minimal"
        title="Processing order"
        description="Please wait while we process the order."
      />
    </div>
  );
}
