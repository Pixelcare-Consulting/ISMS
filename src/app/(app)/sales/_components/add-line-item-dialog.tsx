"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listBrandsForSalesAction,
  listModelsForSalesAction,
  listPackageTypesForSalesAction,
  listPromoTypesForSalesAction,
  listSaleableSerialsAction,
  resolveModelPriceForSalesAction,
} from "@/features/sales/actions/sales.actions";

export type DraftSaleLineItem = {
  key: string;
  packageTypeId: string | null;
  packageTypeName: string;
  promoTypeId: string | null;
  promoTypeName: string;
  brandId: string | null;
  brandName: string;
  modelId: string | null;
  modelLabel: string;
  serialNumberId: string;
  serialNo: string;
  saleAmount: number;
  modelPrice: number | null;
};

type LookupOption = {
  id: string;
  name: string;
};

type PackageOption = LookupOption & {
  quantity: number;
};

type ModelOption = {
  id: string;
  skuCode: string;
  name: string;
  srp: string | null;
  brandId: string | null;
  brandName: string | null;
};

type SerialOption = {
  id: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  modelId: string;
};

type LineItemSetDraft = {
  brandId: string;
  modelId: string;
  serialNumberId: string;
  promoTypeId: string;
  saleAmount: string;
  modelPrice: string;
};

function emptySet(): LineItemSetDraft {
  return {
    brandId: "",
    modelId: "",
    serialNumberId: "",
    promoTypeId: "",
    saleAmount: "",
    modelPrice: "",
  };
}

function newClientKey(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddLineItemDialog({
  branchId,
  usedSerialIds,
  onAdd,
  onClose,
}: {
  branchId: string;
  usedSerialIds: Set<string>;
  onAdd: (rows: DraftSaleLineItem[]) => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [promoTypes, setPromoTypes] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [serials, setSerials] = useState<SerialOption[]>([]);

  const [packageTypeId, setPackageTypeId] = useState("");
  const [sets, setSets] = useState<LineItemSetDraft[]>([emptySet()]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageTypeId) ?? null,
    [packages, packageTypeId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [pkgRows, promoRows, brandRows, modelRows, serialRows] =
          await Promise.all([
            listPackageTypesForSalesAction(),
            listPromoTypesForSalesAction(),
            listBrandsForSalesAction(),
            listModelsForSalesAction(),
            listSaleableSerialsAction(branchId),
          ]);
        if (cancelled) return;
        setPackages(pkgRows);
        setPromoTypes(promoRows);
        setBrands(brandRows);
        setModels(modelRows);
        setSerials(serialRows);
      } catch {
        if (cancelled) return;
        toast.error("Failed to load line item options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  function onPackageChange(id: string) {
    setPackageTypeId(id);
    const pkg = packages.find((p) => p.id === id);
    const n = Math.max(1, pkg?.quantity ?? 1);
    setSets(Array.from({ length: n }, () => emptySet()));
  }

  function updateSet(index: number, patch: Partial<LineItemSetDraft>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function onBrandChange(index: number, brandId: string) {
    const set = sets[index]!;
    const stillValid =
      !set.modelId ||
      !brandId ||
      models.find((m) => m.id === set.modelId)?.brandId === brandId;
    updateSet(
      index,
      stillValid
        ? { brandId }
        : { brandId, modelId: "", serialNumberId: "", modelPrice: "" },
    );
  }

  async function onModelChange(index: number, modelId: string) {
    const model = models.find((m) => m.id === modelId);
    updateSet(index, {
      modelId,
      serialNumberId: "",
      ...(model?.brandId ? { brandId: model.brandId } : {}),
    });

    if (!modelId) {
      updateSet(index, { modelPrice: "" });
      return;
    }

    try {
      const price = await resolveModelPriceForSalesAction({
        modelId,
        packageTypeId: packageTypeId || undefined,
      });
      updateSet(index, {
        modelPrice: price != null ? String(price) : (model?.srp ?? ""),
      });
    } catch {
      updateSet(index, { modelPrice: model?.srp ?? "" });
    }
  }

  function modelOptionsForSet(set: LineItemSetDraft) {
    return set.brandId ? models.filter((m) => m.brandId === set.brandId) : models;
  }

  function serialOptionsForSet(set: LineItemSetDraft, index: number) {
    const claimedInOtherSets = new Set(
      sets
        .map((s, i) => (i === index ? null : s.serialNumberId))
        .filter((id): id is string => Boolean(id)),
    );
    return serials.filter((s) => {
      if (usedSerialIds.has(s.id) || claimedInOtherSets.has(s.id)) return false;
      if (set.modelId) return s.modelId === set.modelId;
      if (set.brandId) {
        return models.find((m) => m.id === s.modelId)?.brandId === set.brandId;
      }
      return true;
    });
  }

  function submit() {
    const rows: DraftSaleLineItem[] = [];

    for (let i = 0; i < sets.length; i++) {
      const set = sets[i]!;
      const label = sets.length === 1 ? "" : `Set ${i + 1}: `;

      if (!set.modelId) {
        toast.error(`${label}model is required`);
        return;
      }
      if (!set.serialNumberId) {
        toast.error(`${label}serial number is required`);
        return;
      }

      const saleAmount = Number(set.saleAmount);
      if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
        toast.error(`${label}sale amount must be positive`);
        return;
      }

      const modelPriceRaw = set.modelPrice.trim();
      const modelPrice = modelPriceRaw === "" ? null : Number(modelPriceRaw);
      if (modelPrice != null && (!Number.isFinite(modelPrice) || modelPrice < 0)) {
        toast.error(`${label}model price is invalid`);
        return;
      }

      const serial = serials.find((s) => s.id === set.serialNumberId);
      if (!serial) {
        toast.error(`${label}serial not found`);
        return;
      }

      const model = models.find((m) => m.id === set.modelId);
      const promo = promoTypes.find((p) => p.id === set.promoTypeId);
      const brand = brands.find((b) => b.id === (model?.brandId ?? set.brandId));

      rows.push({
        key: newClientKey(),
        packageTypeId: selectedPackage?.id ?? null,
        packageTypeName: selectedPackage?.name ?? "—",
        promoTypeId: promo?.id ?? null,
        promoTypeName: promo?.name ?? "—",
        brandId: brand?.id ?? null,
        brandName: brand?.name ?? model?.brandName ?? "—",
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
        rows.length === 1 ? "Line item added" : `Added ${rows.length} line items`,
      );
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[calc(100svh-2rem)] space-y-4 overflow-y-auto rounded-xl border bg-card p-4 shadow-lg sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">Add line item</h3>
          <p className="text-sm text-muted-foreground">
            Choose a package — its quantity expands into one input set per unit,
            and each set becomes a line item.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Package</Label>
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
          {selectedPackage ? (
            <p className="text-sm text-muted-foreground">
              This package creates {selectedPackage.quantity} line item
              {selectedPackage.quantity === 1 ? "" : "s"}.
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          {sets.map((set, index) => {
            const modelOpts = modelOptionsForSet(set);
            const serialOpts = serialOptionsForSet(set, index);
            return (
              <div
                key={index}
                className="space-y-3 rounded-xl border bg-background p-3 sm:p-4"
              >
                {sets.length > 1 ? (
                  <p className="text-sm font-medium">Set {index + 1}</p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchableSelect
                    label="Brand"
                    options={brands.map((b) => ({ id: b.id, label: b.name }))}
                    value={set.brandId}
                    onChange={(id) => onBrandChange(index, id)}
                    placeholder={loading ? "Loading brands…" : "All brands"}
                    searchPlaceholder="Search brands…"
                    emptyMessage="No brands."
                    allowClear
                    disabled={loading || brands.length === 0}
                  />
                  <SearchableSelect
                    label="Model *"
                    options={modelOpts.map((m) => ({
                      id: m.id,
                      label: `${m.skuCode} · ${m.name}`,
                      description: m.brandName ?? undefined,
                    }))}
                    value={set.modelId}
                    onChange={(id) => void onModelChange(index, id)}
                    placeholder={
                      modelOpts.length === 0 && set.brandId
                        ? "No models for brand"
                        : "Select model…"
                    }
                    searchPlaceholder="Search models…"
                    emptyMessage="No models."
                    disabled={loading}
                  />
                  <SearchableSelect
                    label="Serial number *"
                    options={serialOpts.map((s) => ({
                      id: s.id,
                      label: `${s.serialNo} · ${s.skuCode}`,
                    }))}
                    value={set.serialNumberId}
                    onChange={(id) => updateSet(index, { serialNumberId: id })}
                    placeholder={
                      !set.modelId
                        ? "Select model first…"
                        : serialOpts.length === 0
                          ? "No STK serials for model"
                          : "Select serial…"
                    }
                    searchPlaceholder="Search serials…"
                    emptyMessage="No sellable serials for this model at the branch."
                    disabled={loading || !set.modelId || serialOpts.length === 0}
                  />
                  <SearchableSelect
                    label="Promo type"
                    options={promoTypes.map((p) => ({ id: p.id, label: p.name }))}
                    value={set.promoTypeId}
                    onChange={(id) => updateSet(index, { promoTypeId: id })}
                    placeholder={loading ? "Loading promos…" : "Select promo type…"}
                    searchPlaceholder="Search promo types…"
                    emptyMessage="No active promo types."
                    allowClear
                    disabled={loading || promoTypes.length === 0}
                  />
                  <div className="space-y-2">
                    <Label htmlFor={`sale-amount-${index}`}>Sale amount *</Label>
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
                    <Label htmlFor={`model-price-${index}`}>Model price</Label>
                    <Input
                      id={`model-price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={set.modelPrice}
                      onChange={(e) =>
                        updateSet(index, { modelPrice: e.target.value })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending || loading} onClick={submit}>
            {sets.length > 1 ? `Add ${sets.length} Line Items` : "Add Line Item"}
          </Button>
        </div>
      </div>
    </div>
  );
}
