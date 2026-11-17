"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AddTransactionDetailDialog,
  type DraftSaleDetail,
} from "@/app/(app)/sales/_components/add-transaction-detail-dialog";
import { useTableSelection } from "@/components/data-table/use-table-selection";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSalesSource } from "@/app/(app)/sales/_components/sales-source";
import { uploadSaleProofAction } from "@/features/sales/actions/sales.actions";
import { isToFollowSerial } from "@/features/sales/constants/to-follow-serial";
import { capturesDeliveryReceipt } from "@/features/sales/utils/delivery-method";
import { SALE_PROOF_MAX_FILES } from "@/features/sales/utils/sale-proof";
import { earliestSaleTransactionIso } from "@/features/sales/utils/transaction-date";
import { formatPeso } from "@/utils/format-currency";

interface SalesBranchOption {
  id: string;
  name: string;
}

interface LookupOption {
  id: string;
  name: string;
}

type ProofAttachment = {
  path: string;
  name: string;
};

function SalesEncodeBanner({
  pending,
  saveDisabled,
  onSave,
}: {
  pending: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}) {
  const source = useSalesSource();
  return (
    <header className="flex flex-col gap-4 rounded-xl bg-sidebar px-5 py-5 text-sidebar-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {source.copy.encodeTitle}
        </h1>
        <p className="mt-1 text-sm text-sidebar-muted">
          {source.copy.encodeDescription}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          href={source.listHref}
          aria-disabled={pending || undefined}
          tabIndex={pending ? -1 : undefined}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
          className={
            pending
              ? "pointer-events-none inline-flex h-9 items-center gap-1 rounded-full bg-sidebar-accent px-3.5 text-sm font-medium text-sidebar-foreground opacity-50"
              : "inline-flex h-9 items-center gap-1 rounded-full bg-sidebar-accent px-3.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10"
          }
        >
          <ChevronLeft className="size-4" aria-hidden />
          {source.copy.backToList}
        </Link>
        <Button type="button" disabled={saveDisabled} onClick={onSave}>
          Save Transaction
        </Button>
      </div>
    </header>
  );
}

interface NewSalesTransactionFormProps {
  branches: SalesBranchOption[];
  autoResolveBranch: boolean;
  paymentTypes: LookupOption[];
  saleTypes: LookupOption[];
  deliveryMethods: LookupOption[];
  promoTypes: LookupOption[];
  brands: LookupOption[];
}

export function NewSalesTransactionForm({
  branches,
  autoResolveBranch,
  paymentTypes,
  saleTypes,
  deliveryMethods,
  promoTypes,
  brands,
}: NewSalesTransactionFormProps) {
  const router = useRouter();
  const source = useSalesSource();
  const { createSale, listStockSources } = source.actions;
  const [pending, startTransition] = useTransition();
  const resolvedBranchId = autoResolveBranch ? (branches[0]?.id ?? "") : "";
  const [branchId, setBranchId] = useState(resolvedBranchId);
  const [alternateBranchId, setAlternateBranchId] = useState(resolvedBranchId);
  const [stockSources, setStockSources] = useState<SalesBranchOption[]>(
    resolvedBranchId && branches[0]
      ? [{ id: branches[0].id, name: branches[0].name }]
      : [],
  );
  const [transactionNo, setTransactionNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [infoSlipVsoRrReleased, setInfoSlipVsoRrReleased] = useState("");
  const [rrReceiveDeliver, setRrReceiveDeliver] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("");
  const [saleTypeId, setSaleTypeId] = useState("");
  const [customerDeliveryMethodId, setCustomerDeliveryMethodId] = useState("");
  const [proofs, setProofs] = useState<ProofAttachment[]>([]);
  const [proofUploading, setProofUploading] = useState(false);
  const [transactionDate, setTransactionDate] = useState("");
  const [reserved, setReserved] = useState(false);
  const [details, setDetails] = useState<DraftSaleDetail[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [deleteGroupKey, setDeleteGroupKey] = useState<string | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const detailKeys = useMemo(() => details.map((d) => d.key), [details]);
  const selection = useTableSelection(detailKeys);

  // Pickup sales never get a delivery receipt, so the DR fields drop out.
  const showDelivery = capturesDeliveryReceipt(
    deliveryMethods.find((m) => m.id === customerDeliveryMethodId)?.name,
  );

  useEffect(() => {
    if (!branchId) return;

    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStockSources(branchId);
        if (cancelled) return;
        setStockSources(rows);
        setAlternateBranchId((prev) =>
          rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? branchId),
        );
      } catch {
        if (cancelled) return;
        toast.error(source.copy.stockSourceLoadError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, listStockSources, source.copy.stockSourceLoadError]);

  const totalSaleAmount = useMemo(
    () => details.reduce((sum, d) => sum + d.saleAmount, 0),
    [details],
  );

  const editingRows = useMemo(
    () =>
      editingGroupKey
        ? details.filter((d) => d.packageGroupKey === editingGroupKey)
        : undefined,
    [details, editingGroupKey],
  );

  const deleteGroupRows = useMemo(
    () =>
      deleteGroupKey
        ? details.filter((d) => d.packageGroupKey === deleteGroupKey)
        : [],
    [details, deleteGroupKey],
  );

  // Exclude TO-FOLLOW so multiple pending lines can reuse the placeholder.
  // When editing a package group, free its serials so they stay selectable.
  const usedSerialIds = useMemo(
    () =>
      new Set(
        details
          .filter(
            (d) => !editingGroupKey || d.packageGroupKey !== editingGroupKey,
          )
          .map((d) => d.serialNumberId)
          .filter((id) => !isToFollowSerial(id)),
      ),
    [details, editingGroupKey],
  );

  function openAddDetail() {
    setEditingGroupKey(null);
    setDetailOpen(true);
  }

  function openEditPackage(groupKey: string) {
    setEditingGroupKey(groupKey);
    setDetailOpen(true);
  }

  function closeDetailDialog() {
    setDetailOpen(false);
    setEditingGroupKey(null);
  }

  function saveDetails(rows: DraftSaleDetail[]) {
    if (editingGroupKey) {
      setDetails((prev) => [
        ...prev.filter((d) => d.packageGroupKey !== editingGroupKey),
        ...rows,
      ]);
    } else {
      setDetails((prev) => [...prev, ...rows]);
    }
    closeDetailDialog();
  }

  function confirmDeletePackage() {
    if (!deleteGroupKey) return;
    const count = details.filter(
      (d) => d.packageGroupKey === deleteGroupKey,
    ).length;
    setDetails((prev) =>
      prev.filter((d) => d.packageGroupKey !== deleteGroupKey),
    );
    setDeleteGroupKey(null);
    toast.success(
      count === 1
        ? "Removed package set"
        : `Removed package set (${count} serials)`,
    );
  }

  function confirmDeleteSelected() {
    const selected = new Set(selection.selectedIds);
    const count = details.filter((d) => selected.has(d.key)).length;
    if (count === 0) {
      setDeleteSelectedOpen(false);
      return;
    }
    setDetails((prev) => prev.filter((d) => !selected.has(d.key)));
    selection.clearSelection();
    setDeleteSelectedOpen(false);
    toast.success(
      count === 1
        ? "Removed 1 line item"
        : `Removed ${count} line items`,
    );
  }

  function onBranchChange(id: string) {
    setBranchId(id);
    setDetails([]);
    selection.clearSelection();
    setStockSources([]);
    setAlternateBranchId("");
  }

  async function onProofsSelected(fileList: FileList | null) {
    if (!fileList?.length) return;

    const remaining = SALE_PROOF_MAX_FILES - proofs.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${SALE_PROOF_MAX_FILES} proof files`);
      return;
    }

    const selected = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      toast.message(
        `Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added`,
      );
    }

    setProofUploading(true);
    try {
      const formData = new FormData();
      for (const file of selected) {
        formData.append("proof", file);
      }
      const result = await uploadSaleProofAction(formData);
      if (result.error || !("paths" in result) || !result.paths?.length) {
        toast.error(result.error ?? "Failed to upload proof");
        return;
      }
      const uploaded = result.paths.map((path, index) => ({
        path,
        name: selected[index]?.name ?? path.split("/").pop() ?? "proof",
      }));
      setProofs((prev) => [...prev, ...uploaded]);
      toast.success(
        uploaded.length === 1
          ? "Proof uploaded"
          : `${uploaded.length} proof files uploaded`,
      );
    } finally {
      setProofUploading(false);
    }
  }

  function removeProof(path: string) {
    setProofs((prev) => prev.filter((p) => p.path !== path));
  }

  function submit() {
    if (!transactionNo.trim()) {
      toast.error("Transaction number is required");
      return;
    }
    if (!branchId) {
      toast.error(source.copy.selectSoldError);
      return;
    }
    if (!alternateBranchId) {
      toast.error(source.copy.selectStockSourceError);
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!paymentTypeId) {
      toast.error("Payment type is required");
      return;
    }
    if (!saleTypeId) {
      toast.error("Sale type is required");
      return;
    }
    if (!customerDeliveryMethodId) {
      toast.error("Customer delivery method is required");
      return;
    }
    if (details.length === 0) {
      toast.error("Add at least one transaction detail");
      return;
    }

    startTransition(async () => {
      const result = await createSale({
        transactionNo: transactionNo.trim(),
        soldId: branchId,
        stockSourceId: alternateBranchId,
        customerName: customerName.trim(),
        contactNo: contactNo.trim() || undefined,
        // SI/Trans mirrors transaction number — field removed from the form as redundant.
        siTrans: transactionNo.trim(),
        paymentTypeId,
        saleTypeId,
        customerDeliveryMethodId,
        infoSlipVsoRrReleased: infoSlipVsoRrReleased.trim() || undefined,
        rrReceiveDeliver: rrReceiveDeliver.trim() || undefined,
        proof: proofs.length > 0 ? proofs.map((p) => p.path) : undefined,
        transactionDate: transactionDate || undefined,
        reserved,
        details: details.map((d) => ({
          packageTypeId: d.packageTypeId,
          brandId: d.brandId,
          promoTypeId: d.promoTypeId ?? undefined,
          modelId: d.modelId,
          serialNumberId: d.serialNumberId,
          saleAmount: d.saleAmount,
          modelPrice: d.modelPrice ?? undefined,
          deliveryNo: d.deliveryNo ?? undefined,
          deliveryDate: d.deliveryDate ?? undefined,
        })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(reserved ? "Reserved sale recorded" : "Sale transaction saved");
      router.push(source.listHref);
      router.refresh();
    });
  }

  if (branches.length === 0) {
    return (
      <div className="space-y-6">
        <SalesEncodeBanner pending={false} saveDisabled onSave={() => undefined} />
        <div className="rounded-xl border border-border/70 bg-card p-5 text-sm text-muted-foreground shadow-sm sm:p-6">
          {source.copy.noSoldPlaces}
        </div>
      </div>
    );
  }

  const resolvedBranch = autoResolveBranch ? branches[0] : null;
  const showBranchPicker = !autoResolveBranch;
  const deletePackageName = deleteGroupRows[0]?.packageTypeName ?? "this package";

  return (
    <div className="space-y-6">
      <SalesEncodeBanner
        pending={pending}
        saveDisabled={pending || !branchId || !alternateBranchId}
        onSave={submit}
      />
      <div className="rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="space-y-8 p-5 sm:p-6">
          <section className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Transaction</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {source.copy.sectionDescription}
              </p>
            </div>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-txn-no">Transaction number *</Label>
            <Input
              id="sale-txn-no"
              value={transactionNo}
              onChange={(e) => setTransactionNo(e.target.value)}
              placeholder="Enter transaction number"
              className="font-mono"
              autoComplete="off"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            {resolvedBranch ? (
              <>
                <p className="text-sm text-muted-foreground">{source.copy.soldLabel} *</p>
                <p className="mt-1.5 min-h-10 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5 text-foreground">
                  {resolvedBranch.name}
                </p>
              </>
            ) : showBranchPicker ? (
              <>
                <Label className="font-normal text-muted-foreground" htmlFor="sale-branch">
                  {source.copy.soldLabel} *
                </Label>
              <SearchableSelect
                id="sale-branch"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                value={branchId}
                onChange={onBranchChange}
                placeholder={source.copy.soldPlaceholder}
                searchPlaceholder={source.copy.soldSearchPlaceholder}
              />
              </>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-stock-source">{source.copy.stockSourceLabel} *</Label>
            <SearchableSelect
              id="sale-stock-source"
              options={stockSources.map((b) => ({ id: b.id, label: b.name }))}
              value={alternateBranchId}
              onChange={(id) => {
                setAlternateBranchId(id);
                setDetails([]);
              }}
              placeholder={
                branchId
                  ? source.copy.stockSourcePlaceholder
                  : source.copy.stockSourceNeedsSold
              }
              searchPlaceholder={source.copy.stockSourceSearchPlaceholder}
              emptyMessage={source.copy.stockSourceEmpty}
              disabled={!branchId || stockSources.length === 0}
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-date">Transaction date</Label>
            <Input
              id="sale-date"
              type="date"
              min={earliestSaleTransactionIso()}
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-customer">Customer name *</Label>
            <Input
              id="sale-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-contact">Contact no.</Label>
            <Input
              id="sale-contact"
              type="tel"
              inputMode="tel"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
              placeholder="09XX XXX XXXX"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-info-slip">Info slip / VSO / RR released</Label>
            <Input
              id="sale-info-slip"
              value={infoSlipVsoRrReleased}
              onChange={(e) => setInfoSlipVsoRrReleased(e.target.value)}
              placeholder="Input Info slip / VSO / RR released"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-rr-receive">RR receive / deliver</Label>
            <Input
              id="sale-rr-receive"
              value={rrReceiveDeliver}
              onChange={(e) => setRrReceiveDeliver(e.target.value)}
              placeholder="Input RR receive / deliver"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground">Payment type *</Label>
            <SearchableSelect
              options={paymentTypes.map((p) => ({ id: p.id, label: p.name }))}
              value={paymentTypeId}
              onChange={setPaymentTypeId}
              placeholder="Select payment type…"
              searchPlaceholder="Search payment types…"
              emptyMessage="No payment types."
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground">Sale type *</Label>
            <SearchableSelect
              options={saleTypes.map((p) => ({ id: p.id, label: p.name }))}
              value={saleTypeId}
              onChange={setSaleTypeId}
              placeholder="Select sale type…"
              searchPlaceholder="Search sale types…"
              emptyMessage="No sale types."
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground">Customer delivery method *</Label>
            <SearchableSelect
              options={deliveryMethods.map((p) => ({ id: p.id, label: p.name }))}
              value={customerDeliveryMethodId}
              onChange={setCustomerDeliveryMethodId}
              placeholder="Select delivery method…"
              searchPlaceholder="Search delivery methods…"
              emptyMessage="No delivery methods."
            />
          </div>
          <div className="space-y-2">
            <Label className="font-normal text-muted-foreground" htmlFor="sale-proof">Proof</Label>
            <Input
              id="sale-proof"
              type="file"
              accept="image/*,.pdf"
              multiple
              disabled={proofUploading || proofs.length >= SALE_PROOF_MAX_FILES}
              onChange={(e) => {
                const files = e.target.files;
                void onProofsSelected(files);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground">
              You can attach up to {SALE_PROOF_MAX_FILES} images or PDFs
              {proofs.length > 0 ? ` · ${proofs.length} attached` : ""}.
            </p>
            {proofs.length > 0 ? (
              <ul className="space-y-1.5">
                {proofs.map((proof) => (
                  <li
                    key={proof.path}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate" title={proof.name}>
                      {proof.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={proofUploading || pending}
                      onClick={() => removeProof(proof.path)}
                      aria-label={`Remove ${proof.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reserved}
                onChange={(e) => setReserved(e.target.checked)}
              />
              Reserved (RSV)
            </label>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Transaction details</h2>
                {details.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No details yet. Click Add Detail to add line items.
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selection.selectedCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteSelectedOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete selected ({selection.selectedCount})
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={!branchId || !alternateBranchId}
              onClick={openAddDetail}
            >
              <Plus className="size-4" />
              Add Detail
            </Button>
          </div>
        </div>

            {details.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-10 pb-2 pr-2 font-medium">
                    <Checkbox
                      checked={
                        selection.isAllSelected ||
                        (selection.isPartiallySelected
                          ? "indeterminate"
                          : false)
                      }
                      onCheckedChange={(checked) =>
                        selection.toggleAll(checked === true)
                      }
                      aria-label="Select all line items"
                    />
                  </th>
                  <th className="w-10 pb-2 pr-3 text-center font-medium tabular-nums">
                    #
                  </th>
                  <th className="pb-2 pr-3 font-medium">Package</th>
                  <th className="pb-2 pr-3 font-medium">Brand</th>
                  <th className="pb-2 pr-3 font-medium">Promo</th>
                  <th className="pb-2 pr-3 font-medium">Model</th>
                  <th className="pb-2 pr-3 font-medium">Serial number</th>
                  <th className="pb-2 pr-3 font-medium text-right">Sale amount</th>
                  <th className="pb-2 pr-3 font-medium text-right">Model price</th>
                  {showDelivery ? (
                    <>
                      <th className="pb-2 pr-3 font-medium">Delivery no.</th>
                      <th className="pb-2 pr-3 font-medium">Delivery date</th>
                    </>
                  ) : null}
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, index) => (
                  <tr
                    key={d.key}
                    className="border-b last:border-0"
                    data-state={
                      selection.isRowSelected(d.key) ? "selected" : undefined
                    }
                  >
                    <td className="py-2 pr-2">
                      <Checkbox
                        checked={selection.isRowSelected(d.key)}
                        onCheckedChange={(checked) =>
                          selection.toggleRow(d.key, checked === true)
                        }
                        aria-label={`Select ${d.serialNo}`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-center tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-2 pr-3">{d.packageTypeName}</td>
                    <td className="py-2 pr-3">{d.brandName}</td>
                    <td className="py-2 pr-3">{d.promoTypeName ?? "—"}</td>
                    <td className="py-2 pr-3">{d.modelLabel || "—"}</td>
                    <td className="py-2 pr-3 font-mono text-sm">{d.serialNo}</td>
                    <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                      {formatPeso(d.saleAmount)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-sm tabular-nums">
                      {formatPeso(d.modelPrice)}
                    </td>
                    {showDelivery ? (
                      <>
                        <td className="py-2 pr-3">{d.deliveryNo ?? "—"}</td>
                        <td className="py-2 pr-3">{d.deliveryDate ?? "—"}</td>
                      </>
                    ) : null}
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEditPackage(d.packageGroupKey)}
                          aria-label={`Edit package ${d.packageTypeName}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteGroupKey(d.packageGroupKey)}
                          aria-label={`Delete package ${d.packageTypeName}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            ) : null}

            <div className="flex justify-end border-t pt-3 text-sm font-medium font-mono tabular-nums">
              Total sale amount: {formatPeso(totalSaleAmount)}
            </div>
          </section>
        </div>
      </div>

      {detailOpen && branchId && alternateBranchId ? (
        <AddTransactionDetailDialog
          key={editingGroupKey ?? "new-detail"}
          stockBranchId={alternateBranchId}
          stockSourceName={
            stockSources.find((source) => source.id === alternateBranchId)
              ?.name ?? ""
          }
          brands={brands}
          promoTypes={promoTypes}
          usedSerialIds={usedSerialIds}
          transactionDate={transactionDate || undefined}
          initialRows={editingRows}
          showDelivery={showDelivery}
          onAdd={saveDetails}
          onClose={closeDetailDialog}
        />
      ) : null}

      <AlertDialog
        open={deleteGroupKey !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteGroupKey(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package set?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {deleteGroupRows.length} serial
              {deleteGroupRows.length === 1 ? "" : "s"} in{" "}
              <span className="font-medium text-foreground">
                {deletePackageName}
              </span>
              , not just one line. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePackage}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteSelectedOpen}
        onOpenChange={setDeleteSelectedOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected line items?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selection.selectedCount} selected line
              {selection.selectedCount === 1 ? "" : "s"} from this transaction.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSelected}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
