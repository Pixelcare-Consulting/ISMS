"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listModelsForSalesAction,
  listPackageTypesForSalesAction,
  listSaleableSerialsAction,
  resolveModelPriceForSalesAction,
} from "@/features/sales/actions/sales.actions";
import {
  isToFollowSerial,
  TO_FOLLOW_SERIAL_ID,
  TO_FOLLOW_SERIAL_LABEL,
} from "@/features/sales/constants/to-follow-serial";

export type DraftSaleDetail = {
  key: string;
  /** Ties all sets from one Add/Edit Line Items session for package-level edit/delete. */
  packageGroupKey: string;
  packageTypeId: string;
  packageTypeName: string;
  brandId: string;
  brandName: string;
  promoTypeId: string | null;
  promoTypeName: string | null;
  modelId: string;
  modelLabel: string;
  // Holds a real serial id, or TO-FOLLOW when the unit serial is still pending.
  serialNumberId: string;
  serialNo: string;
  saleAmount: number;
  modelPrice: number | null;
};

type PackageOption = {
  id: string;
  name: string;
  quantity: number;
};

type LookupOption = {
  id: string;
  name: string;
};

type ModelOption = {
  id: string;
  skuCode: string;
  name: string;
  srp: string | null;
  brandId: string | null;
};

type SerialOption = {
  id: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  modelId: string;
};

type DetailSetDraft = {
  brandId: string;
  modelId: string;
  serialNumberId: string;
  saleAmount: string;
  modelPrice: string;
  /** True when the model has no master price list at all. */
  noPriceList: boolean;
  /** When set, price came from an older (non-current) price list period. */
  priceFallbackDate: string | null;
};

function emptySet(): DetailSetDraft {
  return {
    brandId: "",
    modelId: "",
    serialNumberId: "",
    saleAmount: "",
    modelPrice: "",
    noPriceList: false,
    priceFallbackDate: null,
  };
}

function formatPriceListDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function newClientKey(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftToSet(row: DraftSaleDetail): DetailSetDraft {
  return {
    brandId: row.brandId,
    modelId: row.modelId,
    serialNumberId: row.serialNumberId,
    saleAmount: String(row.saleAmount),
    modelPrice: row.modelPrice == null ? "" : String(row.modelPrice),
    noPriceList: false,
    priceFallbackDate: null,
  };
}

export function AddTransactionDetailDialog({
  stockBranchId,
  brands,
  promoTypes,
  usedSerialIds,
  transactionDate,
  initialRows,
  onAdd,
  onClose,
}: {
  stockBranchId: string;
  brands: LookupOption[];
  promoTypes: LookupOption[];
  usedSerialIds: Set<string>;
  /** YYYY-MM-DD — used to resolve model price against the right price list period. */
  transactionDate?: string;
  /** When set, dialog opens in edit mode with these package sets prefilled. */
  initialRows?: DraftSaleDetail[];
  onAdd: (rows: DraftSaleDetail[]) => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(initialRows && initialRows.length > 0);
  const editGroupKey = initialRows?.[0]?.packageGroupKey;
  const initialRowsRef = useRef(initialRows);
  const [pending, startTransition] = useTransition();
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [serials, setSerials] = useState<SerialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageTypeId, setPackageTypeId] = useState(
    () => initialRows?.[0]?.packageTypeId ?? "",
  );
  /** Shared across every set in the package — promo applies to all serials. */
  const [promoTypeId, setPromoTypeId] = useState(
    () => initialRows?.[0]?.promoTypeId ?? "",
  );
  const [sets, setSets] = useState<DetailSetDraft[]>(() =>
    initialRows?.length ? initialRows.map(draftToSet) : [emptySet()],
  );
  const [hydrated, setHydrated] = useState(!isEdit);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageTypeId) ?? null,
    [packages, packageTypeId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [pkgRows, serialRows, modelRows] = await Promise.all([
          listPackageTypesForSalesAction(),
          listSaleableSerialsAction(stockBranchId),
          listModelsForSalesAction(),
        ]);
        if (cancelled) return;
        setPackages(pkgRows);
        setSerials(serialRows);
        setModels(modelRows);

        // Re-apply edit values after options load so selects resolve correctly.
        const rows = initialRowsRef.current;
        if (rows?.length) {
          const first = rows[0]!;
          setPackageTypeId(first.packageTypeId);
          setPromoTypeId(first.promoTypeId ?? "");
          setSets(rows.map(draftToSet));
          setHydrated(true);
        }
      } catch {
        if (cancelled) return;
        toast.error("Failed to load detail options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockBranchId]);

  function onPackageChange(id: string) {
    setPackageTypeId(id);
    const pkg = packages.find((p) => p.id === id);
    const n = Math.max(1, pkg?.quantity ?? 1);
    setSets(Array.from({ length: n }, () => emptySet()));
  }

  function updateSet(index: number, patch: Partial<DetailSetDraft>) {
    setSets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function onSetBrandChange(index: number, brandId: string) {
    updateSet(index, {
      brandId,
      modelId: "",
      serialNumberId: "",
      modelPrice: "",
      noPriceList: false,
      priceFallbackDate: null,
    });
  }

  async function onModelChange(index: number, modelId: string) {
    updateSet(index, { modelId, serialNumberId: "" });
    if (!modelId) {
      updateSet(index, {
        modelPrice: "",
        noPriceList: false,
        priceFallbackDate: null,
      });
      return;
    }
    try {
      const resolved = await resolveModelPriceForSalesAction({
        modelId,
        packageTypeId: packageTypeId || undefined,
        transactionDate: transactionDate || undefined,
      });
      if (resolved) {
        updateSet(index, {
          modelPrice: String(resolved.amount),
          noPriceList: false,
          priceFallbackDate:
            resolved.source === "pricelist_fallback"
              ? resolved.periodStart
              : null,
        });
      } else {
        updateSet(index, {
          modelPrice: "0",
          noPriceList: true,
          priceFallbackDate: null,
        });
      }
    } catch {
      toast.error("Failed to resolve model price");
      updateSet(index, {
        modelPrice: "0",
        noPriceList: true,
        priceFallbackDate: null,
      });
    }
  }

  function modelOptionsForSet(set: DetailSetDraft) {
    return models.filter((m) => !set.brandId || m.brandId === set.brandId);
  }

  function serialOptionsForSet(set: DetailSetDraft, index: number) {
    // Only real serials count as "already used" — TO-FOLLOW can appear on multiple sets.
    const claimedInOtherSets = new Set(
      sets
        .map((s, i) => (i === index ? null : s.serialNumberId))
        .filter((id): id is string => Boolean(id) && !isToFollowSerial(id)),
    );
    const realSerials = serials.filter((s) => {
      if (usedSerialIds.has(s.id) || claimedInOtherSets.has(s.id)) return false;
      if (set.modelId && s.modelId !== set.modelId) return false;
      return true;
    });
    // Pin TO-FOLLOW at the top so it's always available for any model.
    // Also keep the currently selected serial visible even if already in usedSerialIds
    // (edit mode) or not in the fresh STK list.
    const selected = set.serialNumberId
      ? serials.find((s) => s.id === set.serialNumberId)
      : undefined;
    const options = [
      {
        id: TO_FOLLOW_SERIAL_ID,
        serialNo: TO_FOLLOW_SERIAL_LABEL,
        skuCode: "",
        modelName: "",
        modelId: set.modelId || "",
      },
      ...realSerials,
    ];
    if (
      selected &&
      !isToFollowSerial(selected.id) &&
      !options.some((o) => o.id === selected.id)
    ) {
      options.splice(1, 0, selected);
    }
    return options;
  }

  function submit() {
    if (!selectedPackage) {
      toast.error("Select a package type");
      return;
    }

    const packageGroupKey = editGroupKey ?? newClientKey();
    const rows: DraftSaleDetail[] = [];
    for (let i = 0; i < sets.length; i++) {
      const set = sets[i]!;
      if (!set.brandId) {
        toast.error(`Set ${i + 1}: brand is required`);
        return;
      }
      if (!set.modelId) {
        toast.error(`Set ${i + 1}: model is required`);
        return;
      }
      if (!set.serialNumberId) {
        toast.error(`Set ${i + 1}: serial number is required`);
        return;
      }
      const saleAmount = Number(set.saleAmount);
      // Allow 0 for free items; reject only negative / invalid numbers.
      if (!Number.isFinite(saleAmount) || saleAmount < 0) {
        toast.error(`Set ${i + 1}: sale amount cannot be negative`);
        return;
      }
      const modelPriceRaw = set.modelPrice.trim();
      const modelPrice = modelPriceRaw === "" ? 0 : Number(modelPriceRaw);
      if (!Number.isFinite(modelPrice) || modelPrice < 0) {
        toast.error(`Set ${i + 1}: model price is invalid`);
        return;
      }
      const model = models.find((m) => m.id === set.modelId);
      // TO-FOLLOW is a UI placeholder — skip looking it up in branch STK serials.
      const isToFollow = isToFollowSerial(set.serialNumberId);
      const serial = isToFollow
        ? null
        : serials.find((s) => s.id === set.serialNumberId);
      if (!isToFollow && !serial) {
        toast.error(`Set ${i + 1}: serial not found`);
        return;
      }
      const brand = brands.find((b) => b.id === set.brandId);
      if (!brand) {
        toast.error(`Set ${i + 1}: brand not found`);
        return;
      }
      const promo = promoTypeId
        ? (promoTypes.find((p) => p.id === promoTypeId) ?? null)
        : null;
      rows.push({
        key: newClientKey(),
        packageGroupKey,
        packageTypeId: selectedPackage.id,
        packageTypeName: selectedPackage.name,
        brandId: brand.id,
        brandName: brand.name,
        promoTypeId: promo?.id ?? null,
        promoTypeName: promo?.name ?? null,
        modelId: set.modelId,
        modelLabel: model ? `${model.skuCode} · ${model.name}` : set.modelId,
        serialNumberId: isToFollow ? TO_FOLLOW_SERIAL_ID : serial!.id,
        serialNo: isToFollow ? TO_FOLLOW_SERIAL_LABEL : serial!.serialNo,
        saleAmount,
        modelPrice,
      });
    }

    // Allow multiple TO-FOLLOW lines; only block duplicate real serials.
    const realSerialIds = rows
      .map((r) => r.serialNumberId)
      .filter((id) => !isToFollowSerial(id));
    if (new Set(realSerialIds).size !== realSerialIds.length) {
      toast.error("Duplicate serials in this package are not allowed");
      return;
    }

    startTransition(() => {
      onAdd(rows);
      toast.success(
        isEdit
          ? rows.length === 1
            ? "Updated 1 detail line"
            : `Updated ${rows.length} detail lines`
          : rows.length === 1
            ? "Added 1 detail line"
            : `Added ${rows.length} detail lines`,
      );
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-2xl max-h-[calc(100svh-2rem)] flex-col rounded-xl border bg-card shadow-lg">
        <div className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-6">
          <div>
            <h3 className="text-lg font-semibold">
              {isEdit ? "Edit Line Items" : "Add Line Items"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose a package. Quantity expands into one set per unit; each set
              needs its own brand, model, and STK serial from the stock source
              branch.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Package *</Label>
            <SearchableSelect
              options={packages.map((p) => ({
                id: p.id,
                label: `${p.name} — qty ${p.quantity}`,
              }))}
              value={packageTypeId}
              onChange={onPackageChange}
              placeholder={loading ? "Loading packages…" : "Select package…"}
              searchPlaceholder="Search packages…"
              emptyMessage="No active package types."
              disabled={loading || packages.length === 0 || !hydrated}
            />
          </div>

          {selectedPackage ? (
            <p className="text-sm text-muted-foreground">
              This package creates {selectedPackage.quantity} set
              {selectedPackage.quantity === 1 ? "" : "s"}.
            </p>
          ) : null}

          <div className="space-y-2">
            <SearchableSelect
              label="Promo type"
              options={promoTypes.map((p) => ({
                id: p.id,
                label: p.name,
              }))}
              value={promoTypeId}
              onChange={setPromoTypeId}
              placeholder="Optional promo…"
              searchPlaceholder="Search promo types…"
              emptyMessage="No promo types."
              disabled={loading || !hydrated}
            />
            <p className="text-xs text-muted-foreground">
              Applies to every serial in this package.
            </p>
          </div>

          <div className="space-y-3">
            {sets.map((set, index) => {
              const serialOpts = serialOptionsForSet(set, index);
              const modelOpts = modelOptionsForSet(set);
              return (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border bg-background p-3 sm:p-4"
                >
                  <p className="text-sm font-medium">Set {index + 1}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SearchableSelect
                      label="Brand *"
                      options={brands.map((b) => ({ id: b.id, label: b.name }))}
                      value={set.brandId}
                      onChange={(id) => onSetBrandChange(index, id)}
                      placeholder="Select brand…"
                      searchPlaceholder="Search brands…"
                      emptyMessage="No brands."
                      disabled={loading || brands.length === 0 || !hydrated}
                    />
                    <SearchableSelect
                      label="Model *"
                      options={modelOpts.map((m) => ({
                        id: m.id,
                        label: `${m.skuCode} · ${m.name}`,
                      }))}
                      value={set.modelId}
                      onChange={(id) => void onModelChange(index, id)}
                      placeholder={
                        !set.brandId ? "Select brand first…" : "Select model…"
                      }
                      searchPlaceholder="Search models…"
                      emptyMessage="No models for this brand."
                      disabled={loading || !set.brandId || !hydrated}
                    />
                    <SearchableSelect
                      label="Serial number *"
                      options={serialOpts.map((s) => ({
                        id: s.id,
                        label: isToFollowSerial(s.id)
                          ? s.serialNo
                          : `${s.serialNo} · ${s.skuCode}`,
                      }))}
                      value={set.serialNumberId}
                      onChange={(id) =>
                        updateSet(index, { serialNumberId: id })
                      }
                      placeholder={
                        !set.modelId
                          ? "Select model first…"
                          : serialOpts.length === 0
                            ? "No STK serials for model"
                            : "Select serial…"
                      }
                      searchPlaceholder="Search serials…"
                      emptyMessage="No sellable serials for this model at the stock source."
                      disabled={
                        loading ||
                        !set.modelId ||
                        !hydrated ||
                        serialOpts.length === 0
                      }
                    />
                    <div className="space-y-2">
                      <Label htmlFor={`sale-amount-${index}`}>
                        Sale amount *
                      </Label>
                      <Input
                        id={`sale-amount-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={set.saleAmount}
                        onChange={(e) =>
                          updateSet(index, { saleAmount: e.target.value })
                        }
                        placeholder="0.00"
                        disabled={!hydrated}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`model-price-${index}`}>
                        Model price
                      </Label>
                      <Input
                        id={`model-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={set.modelPrice}
                        readOnly
                        disabled
                        placeholder="0.00"
                      />
                      {set.noPriceList ? (
                        <p className="text-xs text-muted-foreground">
                          No price list set up for this model. Price stays at 0
                          and cannot be edited.
                        </p>
                      ) : set.priceFallbackDate ? (
                        <p className="text-xs text-muted-foreground">
                          Using latest price list from{" "}
                          {formatPriceListDate(set.priceFallbackDate)}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4 sm:p-6">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || loading || !hydrated}
            onClick={submit}
          >
            {isEdit ? "Save Changes" : "Add Details"}
          </Button>
        </div>
      </div>
    </div>
  );
}
