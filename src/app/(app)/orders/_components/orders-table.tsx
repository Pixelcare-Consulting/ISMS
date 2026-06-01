"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveOrderAction,
  createOrderAction,
  listBranchesForOrderAction,
  listModelsForOrderAction,
  rejectOrderAction,
} from "@/features/orders/actions/order.actions";
import type { BranchOrderStatus } from "@prisma/client";
import { ORDER_WORKFLOW_DESCRIPTION, isOrderPendingApproval } from "@/features/orders/constants/order-workflow";
import { OrderWorkflowDialog } from "@/app/(app)/orders/_components/order-workflow-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableScroll, DataTableShell } from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

interface OrderRow {
  id: string;
  orderType: string;
  status: string;
  branch: { name: string };
  createdBy: { name: string | null; email: string };
  details: { quantity: number; model: { skuCode: string } }[];
}

interface OrderModelOption {
  id: string;
  skuCode: string;
  name: string;
  maxQty: number | null;
  onPlanogram: boolean;
}

interface OrdersTableProps {
  result: {
    items: OrderRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function buildOrdersHref(page: number): string {
  return page > 1 ? `/orders?page=${page}` : "/orders";
}

export function OrdersTable({ result }: OrdersTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [workflowOrder, setWorkflowOrder] = useState<OrderRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(
    () =>
      result.items.filter((o) =>
        matchesTableSearch(query, [o.id, o.branch.name, o.status]),
      ),
    [result.items, query],
  );

  function handleApprove(comment?: string) {
    if (!workflowOrder) return;
    startTransition(async () => {
      const result = await approveOrderAction(workflowOrder.id, comment);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Approval recorded");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  function handleReject(comment?: string) {
    if (!workflowOrder) return;
    startTransition(async () => {
      const result = await rejectOrderAction(workflowOrder.id, comment);
      if (result.error) {
        toast.error("Could not reject");
        return;
      }
      toast.success("Order rejected");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar value={query} onChange={setQuery} placeholder="Search orders…">
        <Button onClick={() => setShowCreate(true)}>Create order</Button>
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-sm">{o.id.slice(-8)}</TableCell>
                <TableCell>{o.branch.name}</TableCell>
                <TableCell>{o.orderType}</TableCell>
                <TableCell>
                  <Badge variant="outline">{o.status}</Badge>
                </TableCell>
                <TableCell>
                  {o.details.map((d) => `${d.model.skuCode}×${d.quantity}`).join(", ")}
                </TableCell>
                <TableCell>
                  {isOrderPendingApproval(o.status as BranchOrderStatus) ? (
                    <Button size="sm" variant="outline" onClick={() => setWorkflowOrder(o)}>
                      Review
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableScroll>
      <TablePagination
        meta={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "order",
        }}
        buildHref={buildOrdersHref}
      />
      {workflowOrder ? (
        <OrderWorkflowDialog
          orderNumber={workflowOrder.id.slice(-8)}
          status={workflowOrder.status}
          open
          pending={pending}
          onOpenChange={() => setWorkflowOrder(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
      {showCreate ? (
        <CreateOrderDialog onClose={() => setShowCreate(false)} />
      ) : null}
    </DataTableShell>
  );
}

function CreateOrderDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<OrderModelOption[]>([]);
  const [branchId, setBranchId] = useState("");
  const [orderType, setOrderType] = useState<"manual" | "special">("manual");
  const [modelId, setModelId] = useState("");
  const [qty, setQty] = useState(1);
  const [loaded, setLoaded] = useState(false);

  const selectedModel = models.find((m) => m.id === modelId);

  async function loadBranches() {
    const b = await listBranchesForOrderAction();
    setBranches(b);
    if (b[0]) setBranchId(b[0].id);
    setLoaded(true);
  }

  useEffect(() => {
    if (!branchId) return;
    listModelsForOrderAction(branchId, orderType).then((m) => {
      setModels(m);
      if (m[0]) setModelId(m[0].id);
      else setModelId("");
    });
  }, [branchId, orderType]);

  function submit() {
    startTransition(async () => {
      const result = await createOrderAction({
        branchId,
        orderType,
        details: [{ modelId, quantity: qty }],
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        orderType === "special"
          ? "Special order submitted for SP approval"
          : "Manual order submitted for PS review",
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
        <h3 className="font-medium">Create branch order</h3>
        {!loaded ? (
          <Button variant="outline" type="button" onClick={loadBranches}>
            Load branches
          </Button>
        ) : (
          <>
            <div>
              <Label>Branch</Label>
              <select
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Order type</Label>
              <select
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as "manual" | "special")}
              >
                <option value="manual">Manual (planogram SKUs)</option>
                <option value="special">Special (off-planogram allowed)</option>
              </select>
            </div>
            <div>
              <Label>Model</Label>
              <select
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.skuCode} — {m.name}
                    {m.maxQty != null ? ` (max ${m.maxQty})` : ""}
                  </option>
                ))}
              </select>
              {models.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No eligible SKUs for this branch and order type.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Quantity</Label>
              <input
                type="number"
                min={1}
                max={selectedModel?.maxQty ?? undefined}
                className="flex h-9 w-full rounded-md border px-2 text-sm"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
              {selectedModel?.maxQty != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Planogram max: {selectedModel.maxQty}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={pending || !modelId} onClick={submit}>
                Submit
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
