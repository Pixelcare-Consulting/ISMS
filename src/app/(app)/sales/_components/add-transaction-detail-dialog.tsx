"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

export type DraftSaleDetail = {
  key: string;
  packageTypeId: string;
  packageTypeName: string;
  brandId: string;
  brandName: string;
  promoTypeId: string | null;
  promoTypeName: string | null;
  modelId: string;
  modelLabel: string;
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
  promoTypeId: string;
  modelId: string;
  serialNumberId: string;
  saleAmount: string;
  modelPrice: string;
  noPriceList: boolean;
};

function emptySet(): DetailSetDraft {
  return {
    brandId: "",
    promoTypeId: "",
    modelId: "",
    serialNumberId: "",
    saleAmount: "",
    modelPrice: "",
    noPriceList: false,
  };
}

function newClientKey(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddTransactionDetailDialog({
  stockBranchId,
  brands,
  promoTypes,
  usedSerialIds,
  onAdd,
  onClose,
}: {
  stockBranchId: string;
  brands: LookupOption[];
  promoTypes: LookupOption[];
  usedSerialIds: Set<string>;
  onAdd: (rows: DraftSaleDetail[]) => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [serials, setSerials] = useState<SerialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageTypeId, setPackageTypeId] = useState("");
  const [sets, setSets] = useState<DetailSetDraft[]>([emptySet()]);

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
    });
  }

  async function onModelChange(index: number, modelId: string) {
    updateSet(index, { modelId, serialNumberId: "" });
    if (!modelId) {
      updateSet(index, { modelPrice: "", noPriceList: false });
      return;
    }
    try {
      const price = await resolveModelPriceForSalesAction({
        modelId,
        packageTypeId: packageTypeId || undefined,
      });
      if (price != null) {
        updateSet(index, { modelPrice: String(price), noPriceList: false });
      } else {
        updateSet(index, { modelPrice: "", noPriceList: true });
      }
    } catch {
      toast.error("Failed to resolve model price");
      updateSet(index, { modelPrice: "", noPriceList: false });
    }
  }

  function modelOptionsForSet(set: DetailSetDraft) {
    return models.filter((m) => !set.brandId || m.brandId === set.brandId);
  }

  function serialOptionsForSet(set: DetailSetDraft, index: number) {
    const claimedInOtherSets = new Set(
      sets
        .map((s, i) => (i === index ? null : s.serialNumberId))
        .filter((id): id is string => Boolean(id)),
    );
    return serials.filter((s) => {
      if (usedSerialIds.has(s.id) || claimedInOtherSets.has(s.id)) return false;
      if (set.modelId && s.modelId !== set.modelId) return false;
      return true;
    });
  }

  function submit() {
    if (!selectedPackage) {
      toast.error("Select a package type");
      return;
    }

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
      if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
        toast.error(`Set ${i + 1}: sale amount must be positive`);
        return;
      }
      const modelPriceRaw = set.modelPrice.trim();
      const modelPrice = modelPriceRaw === "" ? null : Number(modelPriceRaw);
      if (
        modelPrice != null &&
        (!Number.isFinite(modelPrice) || modelPrice < 0)
      ) {
        toast.error(`Set ${i + 1}: model price is invalid`);
        return;
      }
      const model = models.find((m) => m.id === set.modelId);
      const serial = serials.find((s) => s.id === set.serialNumberId);
      if (!serial) {
        toast.error(`Set ${i + 1}: serial not found`);
        return;
      }
      const brand = brands.find((b) => b.id === set.brandId);
      if (!brand) {
        toast.error(`Set ${i + 1}: brand not found`);
        return;
      }
      const promo = set.promoTypeId
        ? (promoTypes.find((p) => p.id === set.promoTypeId) ?? null)
        : null;
      rows.push({
        key: newClientKey(),
        packageTypeId: selectedPackage.id,
        packageTypeName: selectedPackage.name,
        brandId: brand.id,
        brandName: brand.name,
        promoTypeId: promo?.id ?? null,
        promoTypeName: promo?.name ?? null,
        modelId: set.modelId,
        modelLabel: model ? `${model.skuCode} · ${model.name}` : set.modelId,
        serialNumberId: serial.id,
        serialNo: serial.serialNo,
        saleAmount,
        modelPrice,
      });
    }

    const serialIds = rows.map((r) => r.serialNumberId);
    if (new Set(serialIds).size !== serialIds.length) {
      toast.error("Duplicate serials in this package are not allowed");
      return;
    }

    startTransition(() => {
      onAdd(rows);
      toast.success(
        rows.length === 1
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
            <h3 className="text-lg font-semibold">Add Line Items</h3>
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
              disabled={loading || packages.length === 0}
            />
          </div>

          {selectedPackage ? (
            <p className="text-sm text-muted-foreground">
              This package creates {selectedPackage.quantity} set
              {selectedPackage.quantity === 1 ? "" : "s"}.
            </p>
          ) : null}

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
                      disabled={loading || brands.length === 0}
                    />
                    <SearchableSelect
                      label="Promo type"
                      options={promoTypes.map((p) => ({
                        id: p.id,
                        label: p.name,
                      }))}
                      value={set.promoTypeId}
                      onChange={(id) => updateSet(index, { promoTypeId: id })}
                      placeholder="Optional promo…"
                      searchPlaceholder="Search promo types…"
                      emptyMessage="No promo types."
                      disabled={loading}
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
                      disabled={loading || !set.brandId}
                    />
                    <SearchableSelect
                      label="Serial number *"
                      options={serialOpts.map((s) => ({
                        id: s.id,
                        label: `${s.serialNo} · ${s.skuCode}`,
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
                        loading || !set.modelId || serialOpts.length === 0
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
                        onChange={(e) =>
                          updateSet(index, {
                            modelPrice: e.target.value,
                            noPriceList: false,
                          })
                        }
                        placeholder={
                          set.noPriceList
                            ? "No price list available at this date"
                            : "0.00"
                        }
                      />
                      {set.noPriceList ? (
                        <p className="text-xs text-destructive">
                          No price list available at this date. Enter the
                          price manually.
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
          <Button type="button" disabled={pending || loading} onClick={submit}>
            Add Details
          </Button>
        </div>
      </div>
    </div>
  );
}
