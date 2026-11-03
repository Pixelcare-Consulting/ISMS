"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createColumnHelper } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addScOrderingCustomerAction,
  removeScOrderingCustomerAction,
  setPrimaryScOrderingCustomerAction,
  updateScOrderingDefaultsAction,
} from "@/features/service-center-ordering/actions/sc-ordering-settings.actions";
import {
  SAP_CODE_MAX,
  SC_ORDERING_DEFAULT_LABELS,
  type ScOrderingDefaultKey,
} from "@/features/service-center-ordering/constants";
import { DataTable, type DataTableColumn, type DataTableFeatures } from "@/lib/data-table";

export interface ScOrderingCustomerRow {
  id: string;
  cardCode: string;
  cardName: string | null;
  isPrimary: boolean;
}

const customerColumn = createColumnHelper<DataTableFeatures, ScOrderingCustomerRow>();

const DEFAULT_KEYS = Object.keys(SC_ORDERING_DEFAULT_LABELS) as ScOrderingDefaultKey[];

const DEFAULT_HINTS: Record<ScOrderingDefaultKey, string> = {
  warehouseCode: "Required. The warehouse every line ships from.",
  branchCode: "Branch distribution rule on every line.",
  departmentCode: "Department distribution rule on every line.",
  cogsBranchCode: "COGS branch distribution rule on every line.",
};

export function ServiceCenterOrderingPanel({
  customers,
  defaults,
  canEdit,
}: {
  customers: ScOrderingCustomerRow[];
  defaults: Record<ScOrderingDefaultKey, string | null>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newCode, setNewCode] = useState("");
  const [draft, setDraft] = useState<Record<ScOrderingDefaultKey, string>>(() =>
    Object.fromEntries(DEFAULT_KEYS.map((key) => [key, defaults[key] ?? ""])) as Record<
      ScOrderingDefaultKey,
      string
    >,
  );

  function run(action: () => Promise<{ error?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<ScOrderingCustomerRow>[] = [
      customerColumn.accessor("cardCode", {
        header: "Customer code",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2 font-medium">
            {row.original.cardCode}
            {row.original.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
          </span>
        ),
      }),
      customerColumn.accessor("cardName", {
        header: "SAP name",
        enableSorting: false,
        cell: ({ row }) => row.original.cardName ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
    ];
    if (canEdit) {
      cols.push(
        customerColumn.display({
          id: "actions",
          header: "",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {row.original.isPrimary ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setPrimaryScOrderingCustomerAction(row.original.id),
                      `${row.original.cardCode} is now the primary customer`,
                    )
                  }
                >
                  Make primary
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label={`Remove ${row.original.cardCode}`}
                onClick={() => {
                  if (!confirm(`Remove ${row.original.cardCode} from service center ordering?`)) return;
                  run(
                    () => removeScOrderingCustomerAction(row.original.id),
                    `${row.original.cardCode} removed`,
                  );
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
    // `run` only closes over stable setters and the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, pending]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Customers</h3>
          <p className="text-sm text-muted-foreground">
            SAP customers a service center order can bill. The primary one is preselected on the
            order form.
          </p>
        </div>
        <DataTable
          data={customers}
          columns={columns}
          getRowId={(row) => row.id}
          empty={customers.length === 0}
          emptyMessage="No customers yet. Service center orders can't be created until one is added."
        />
        {canEdit ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const code = newCode.trim();
              if (!code) return;
              run(() => addScOrderingCustomerAction(code), `${code.toUpperCase()} added`, () =>
                setNewCode(""),
              );
            }}
          >
            <div className="space-y-2 sm:w-64">
              <Label htmlFor="sc-ordering-customer">Add customer code</Label>
              <Input
                id="sc-ordering-customer"
                value={newCode}
                maxLength={SAP_CODE_MAX}
                placeholder="e.g. CELG004"
                onChange={(event) => setNewCode(event.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending || !newCode.trim()}>
              Add
            </Button>
          </form>
        ) : null}
        {canEdit ? (
          <p className="text-xs text-muted-foreground">
            The code is checked against SAP customers when you add it.
          </p>
        ) : null}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => updateScOrderingDefaultsAction(draft), "Service center ordering defaults saved");
        }}
      >
        <div>
          <h3 className="text-sm font-medium">SAP defaults</h3>
          <p className="text-sm text-muted-foreground">
            Codes as they are in SAP. Each order keeps the values it was created with. The service
            center itself goes in the Service Center column, and Business Type is always Outright.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {DEFAULT_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`sc-ordering-${key}`}>{SC_ORDERING_DEFAULT_LABELS[key]}</Label>
              <Input
                id={`sc-ordering-${key}`}
                value={draft[key]}
                maxLength={SAP_CODE_MAX}
                onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">{DEFAULT_HINTS[key]}</p>
            </div>
          ))}
        </div>
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            Save defaults
          </Button>
        ) : null}
      </form>
    </div>
  );
}
