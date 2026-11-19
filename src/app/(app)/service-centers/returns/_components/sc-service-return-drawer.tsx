"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  completeScServiceReplacementAction,
  getScServiceReturnAction,
  listScServiceReplacementStockAction,
  raiseScServiceSpecialOrderAction,
  rejectScServiceReturnAction,
  submitScServiceReturnAction,
  type ScServiceReturnDetail,
} from "@/features/service-center-ops/actions/sc-service-returns.actions";
import {
  SC_SERVICE_RETURN_STATUS_META,
  scServiceActionLabel,
} from "@/features/service-center-ops/constants/sc-service-returns";

type StockData = Extract<
  Awaited<ReturnType<typeof listScServiceReplacementStockAction>>,
  { success: true }
>["data"];

type PendingConfirm = "submit_return" | "replace" | "special_order" | "reject";

const CONFIRM_COPY: Record<PendingConfirm, { title: string; description: string; label: string }> = {
  submit_return: {
    title: "Submit this return?",
    description:
      "The returned unit goes into this service center's stock and the request is completed. The sale is closed.",
    label: "Submit Return",
  },
  replace: {
    title: "Replace this unit?",
    description:
      "The returned unit goes into this service center's stock. The chosen unit is Sold on the same invoice and the sale is closed.",
    label: "Replace Unit",
  },
  special_order: {
    title: "Raise a special order?",
    description:
      "A special service center order for one unit is created and goes for approval. This request waits as Awaiting Stock until you accept its delivery.",
    label: "Raise Special Order",
  },
  reject: {
    title: "Reject this request?",
    description:
      "The unit gets back the status it had before the request (Sold, Official Sold or Reserved), the sale reopens, and the CSR is notified with your reason.",
    label: "Reject",
  },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

interface ScServiceReturnDrawerProps {
  returnRequestId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Keyed by request so every opened request starts from a clean form. */
export function ScServiceReturnDrawer(props: ScServiceReturnDrawerProps) {
  return <ScServiceReturnDrawerContent key={props.returnRequestId ?? "closed"} {...props} />;
}

function ScServiceReturnDrawerContent({
  returnRequestId,
  onClose,
  onChanged,
}: ScServiceReturnDrawerProps) {
  const [detail, setDetail] = useState<ScServiceReturnDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loading = returnRequestId != null && detail == null && loadError == null;
  const [pending, startTransition] = useTransition();

  const [locationId, setLocationId] = useState("");
  /** Stock loaded for one model choice; a different choice means it is loading. */
  const [stockResult, setStockResult] = useState<{ modelId: string; data: StockData | null } | null>(
    null,
  );
  const [modelId, setModelId] = useState("");
  const [serialId, setSerialId] = useState("");
  const [orderLocationId, setOrderLocationId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    if (!returnRequestId) return;
    let cancelled = false;
    void getScServiceReturnAction(returnRequestId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setLoadError(res.error ?? "Service return not found");
        return;
      }
      setDetail(res.data);
      const onlyLocation = res.data.locations.length === 1 ? res.data.locations[0]!.id : "";
      setLocationId(onlyLocation);
      setOrderLocationId(onlyLocation);
      setModelId(res.data.modelId ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [returnRequestId]);

  const canReplace =
    detail?.status === "pending_sc" && detail.actionType === "replacement";
  const stock = stockResult?.data ?? null;
  const stockLoading = canReplace && stockResult?.modelId !== modelId;

  // Replacement candidates for the chosen model at this service center.
  useEffect(() => {
    if (!canReplace || !detail) return;
    let cancelled = false;
    void listScServiceReplacementStockAction({
      returnRequestId: detail.id,
      modelId: modelId || null,
    }).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        toast.error(res.error ?? "Could not load service center stock");
        setStockResult({ modelId, data: null });
        return;
      }
      setStockResult({ modelId, data: res.data });
      const held = res.data.serials.find((serial) => serial.held);
      setSerialId((current) =>
        res.data.serials.some((serial) => serial.id === current) ? current : (held?.id ?? ""),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [canReplace, detail, modelId]);

  function run(
    action: () => Promise<{ error?: string; success?: true; orderNumber?: string }>,
    success: (res: { orderNumber?: string }) => string,
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(success(res));
      setConfirm(null);
      onChanged();
      onClose();
    });
  }

  function confirmAction() {
    if (!detail || !confirm) return;
    const id = detail.id;
    switch (confirm) {
      case "submit_return":
        run(
          () => submitScServiceReturnAction({ returnRequestId: id, serviceCenterLocationId: locationId }),
          () => "Return submitted. The unit is in service center stock.",
        );
        return;
      case "replace":
        run(
          () =>
            completeScServiceReplacementAction({
              returnRequestId: id,
              serviceCenterLocationId: locationId,
              modelId,
              replacementSerialNumberId: serialId,
            }),
          () => "Replacement done. The new unit is Sold on the same invoice.",
        );
        return;
      case "special_order":
        run(
          () =>
            raiseScServiceSpecialOrderAction({
              returnRequestId: id,
              modelId: detail.modelId ?? "",
              serviceCenterLocationId: orderLocationId || null,
              poNumber: poNumber.trim() || null,
            }),
          (res) => `Special order ${res.orderNumber ?? ""} raised. It now goes for approval.`.replace("  ", " "),
        );
        return;
      case "reject":
        run(
          () => rejectScServiceReturnAction({ returnRequestId: id, reason: rejectReason }),
          () => "Request rejected. The CSR was notified.",
        );
        return;
      default: {
        const _exhaustive: never = confirm;
        void _exhaustive;
      }
    }
  }

  function requestConfirm(next: PendingConfirm) {
    if ((next === "submit_return" || next === "replace") && !locationId) {
      toast.error("Choose the location that receives the returned unit");
      return;
    }
    if (next === "replace" && (!modelId || !serialId)) {
      toast.error("Choose the replacement model and serial");
      return;
    }
    if (next === "special_order" && !detail?.modelId) {
      toast.error("The sold model is unknown, so it cannot be ordered");
      return;
    }
    if (next === "reject" && !rejectReason.trim()) {
      toast.error("Enter the reason for rejecting");
      return;
    }
    setConfirm(next);
  }

  const statusMeta = detail ? SC_SERVICE_RETURN_STATUS_META[detail.status] : null;
  const modelOptions = (stock?.models ?? []).map((model) => ({
    id: model.id,
    label: `${model.name} (${model.count} in stock)`,
  }));
  const serialOptions = (stock?.serials ?? []).map((serial) => ({
    id: serial.id,
    label: serial.held ? `${serial.serialNo} · held for this request` : serial.serialNo,
    description: `Location ${serial.locationCode}`,
  }));
  const locationOptions = (detail?.locations ?? []).map((location) => ({
    id: location.id,
    label: location.name,
  }));
  const soldModelInStock = Boolean(
    detail?.modelId && stock?.models.some((model) => model.id === detail.modelId),
  );
  const copy = confirm ? CONFIRM_COPY[confirm] : null;

  return (
    <Sheet open={returnRequestId != null} onOpenChange={(open) => !open && !pending && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <p className="text-xs font-medium text-muted-foreground">
            {detail ? scServiceActionLabel(detail.actionType) : "Service return"}
          </p>
          <SheetTitle className="font-mono text-2xl tracking-tight">
            {detail?.transactionNo ?? (loading ? "Loading…" : "Service return")}
          </SheetTitle>
          <SheetDescription>
            {detail ? `Sold at ${detail.serviceCenterName}` : "Request details"}
          </SheetDescription>
          {detail && statusMeta ? (
            <div className="pt-2">
              <StatusCodeBadge code={detail.status} name={statusMeta.label} color={statusMeta.color} />
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-6 px-4 pb-6">
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading request">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : null}

          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : null}

          {detail ? (
            <>
              <section className="space-y-3" aria-labelledby="sc-return-unit">
                <SectionTitle>
                  <span id="sc-return-unit">Returned unit</span>
                </SectionTitle>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Serial" value={detail.serialNo} />
                  <Detail label="Model" value={detail.modelLabel} />
                  <Detail label="Return as" value={detail.stockStatusCode === "DEF" ? "DEF (Defective)" : "STK (Stock)"} />
                  <Detail label="Document type" value={detail.documentTypeName} />
                  <div className="sm:col-span-2">
                    <Detail label="Problem description" value={detail.problemDescriptionText} />
                  </div>
                </dl>
              </section>

              <Separator />

              <section className="space-y-3" aria-labelledby="sc-return-sale">
                <SectionTitle>
                  <span id="sc-return-sale">Sale and request</span>
                </SectionTitle>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Customer" value={detail.customerName} />
                  <Detail label="Contact" value={detail.contactNo} />
                  <Detail label="Sale date" value={formatDateTime(detail.transactionDate)} />
                  <Detail label="Requested" value={`${formatDateTime(detail.createdAt)}${detail.requestedByName ? ` by ${detail.requestedByName}` : ""}`} />
                  {detail.classification ? <Detail label="Classification" value={detail.classification} /> : null}
                  {detail.natureOfTransaction ? <Detail label="Nature of transaction" value={detail.natureOfTransaction} /> : null}
                  {detail.refContactPo ? <Detail label="Ref / contact / PO" value={detail.refContactPo} /> : null}
                  {detail.customerDealerBranch ? <Detail label="Customer / dealer / branch" value={detail.customerDealerBranch} /> : null}
                </dl>
                {detail.atrOdrfUrl ? (
                  <a
                    href={detail.atrOdrfUrl}
                    className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Download ATR / ODRF
                  </a>
                ) : null}
              </section>

              {detail.specialOrder ? (
                <>
                  <Separator />
                  <section className="space-y-2" aria-labelledby="sc-return-order">
                    <SectionTitle>
                      <span id="sc-return-order">Special order</span>
                    </SectionTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono">{detail.specialOrder.orderNumber}</span>
                      <OrderStatusBadge status={detail.specialOrder.status} />
                      {detail.specialOrder.sapDocNum != null ? (
                        <span className="text-muted-foreground">SAP SO {detail.specialOrder.sapDocNum}</span>
                      ) : null}
                    </div>
                    {detail.status === "awaiting_stock" ? (
                      <p className="text-sm text-muted-foreground">
                        Waiting for this order. Accept its delivery under SC Deliveries; the unit is then held for
                        this request and it comes back here as Pending SC.
                      </p>
                    ) : null}
                    {detail.heldSerialNo ? (
                      <p className="text-sm">
                        Held unit: <span className="font-mono">{detail.heldSerialNo}</span>
                      </p>
                    ) : null}
                  </section>
                </>
              ) : null}

              {detail.status === "completed" || detail.status === "rejected" ? (
                <>
                  <Separator />
                  <section className="space-y-3" aria-labelledby="sc-return-outcome">
                    <SectionTitle>
                      <span id="sc-return-outcome">Outcome</span>
                    </SectionTitle>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Detail
                        label={detail.status === "rejected" ? "Rejected" : "Finished"}
                        value={`${formatDateTime(detail.inspectedAt)}${detail.inspectedByName ? ` by ${detail.inspectedByName}` : ""}`}
                      />
                      {detail.receivedAt ? <Detail label="Received at" value={detail.receivedAt} /> : null}
                      {detail.replacementSerialNo ? (
                        <>
                          <Detail
                            label="Returned serial"
                            value={[detail.serialNo, detail.modelLabel].filter(Boolean).join(" · ")}
                          />
                          <Detail
                            label="Replacement serial"
                            value={[detail.replacementSerialNo, detail.replacementModelLabel].filter(Boolean).join(" · ")}
                          />
                        </>
                      ) : null}
                      {detail.rejectReason ? (
                        <div className="sm:col-span-2">
                          <Detail label="Reason" value={detail.rejectReason} />
                        </div>
                      ) : null}
                    </dl>
                  </section>
                </>
              ) : null}

              {detail.status === "pending_sc" ? (
                <>
                  <Separator />
                  <section className="space-y-4" aria-labelledby="sc-return-finish">
                    <SectionTitle>
                      <span id="sc-return-finish">
                        {detail.actionType === "replacement" ? "Replace from your stock" : "Submit return"}
                      </span>
                    </SectionTitle>
                    <SearchableSelect
                      id="sc-return-location"
                      label="Location that receives the returned unit"
                      options={locationOptions}
                      value={locationId}
                      onChange={setLocationId}
                      placeholder="Choose a location"
                      emptyMessage="This service center has no locations."
                    />

                    {detail.actionType === "replacement" ? (
                      <>
                        <SearchableSelect
                          id="sc-return-model"
                          label="Replacement model"
                          options={modelOptions}
                          value={modelId}
                          onChange={(value) => {
                            setModelId(value);
                            setSerialId("");
                          }}
                          placeholder={stockLoading ? "Loading stock…" : "Choose a model"}
                          emptyMessage="No STK units at this service center."
                          disabled={stockLoading && !stock}
                        />
                        <SearchableSelect
                          id="sc-return-serial"
                          label="Replacement serial (STK)"
                          options={serialOptions}
                          value={serialId}
                          onChange={setSerialId}
                          placeholder={modelId ? "Choose a serial" : "Choose a model first"}
                          emptyMessage="No STK units of this model here."
                          disabled={!modelId || stockLoading}
                        />
                        {!stockLoading && stock && !soldModelInStock ? (
                          <p className="text-sm text-muted-foreground">
                            The sold model is not in this service center&apos;s stock. Choose another model, or raise a
                            special order below.
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          className="w-full"
                          disabled={pending || stockLoading || !serialId || !locationId}
                          onClick={() => requestConfirm("replace")}
                        >
                          Replace Unit
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        className="w-full"
                        disabled={pending || !locationId}
                        onClick={() => requestConfirm("submit_return")}
                      >
                        Submit Return
                      </Button>
                    )}
                  </section>

                  {detail.actionType === "replacement" ? (
                    <>
                      <Separator />
                      <section className="space-y-4" aria-labelledby="sc-return-special">
                        <div className="space-y-1">
                          <SectionTitle>
                            <span id="sc-return-special">Not in stock: special order</span>
                          </SectionTitle>
                          <p className="text-sm text-muted-foreground">
                            Orders one {detail.modelLabel ?? "unit of the sold model"} for this service center.
                          </p>
                        </div>
                        <SearchableSelect
                          id="sc-order-location"
                          label="Delivery location (optional)"
                          options={locationOptions}
                          value={orderLocationId}
                          onChange={setOrderLocationId}
                          placeholder="Choose when the delivery arrives"
                          allowClear
                        />
                        <div className="space-y-2">
                          <Label htmlFor="sc-order-po">PO number (optional)</Label>
                          <Input
                            id="sc-order-po"
                            value={poNumber}
                            maxLength={20}
                            onChange={(event) => setPoNumber(event.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={pending || !detail.modelId}
                          onClick={() => requestConfirm("special_order")}
                        >
                          Raise Special Order
                        </Button>
                      </section>
                    </>
                  ) : null}

                  <Separator />
                  <section className="space-y-3" aria-labelledby="sc-return-reject">
                    <SectionTitle>
                      <span id="sc-return-reject">Reject</span>
                    </SectionTitle>
                    <div className="space-y-2">
                      <Label htmlFor="sc-reject-reason">Reason</Label>
                      <Textarea
                        id="sc-reject-reason"
                        value={rejectReason}
                        maxLength={500}
                        rows={3}
                        placeholder="Why this request is rejected"
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full"
                      disabled={pending || !rejectReason.trim()}
                      onClick={() => requestConfirm("reject")}
                    >
                      Reject Request
                    </Button>
                  </section>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent className="z-60" overlayClassName="z-60">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy?.description} Sale <span className="font-medium text-foreground">{detail?.transactionNo}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={confirm === "reject" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={(event) => {
                event.preventDefault();
                confirmAction();
              }}
            >
              {pending ? "Working…" : copy?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
