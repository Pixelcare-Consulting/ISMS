"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { CreateOrderDialog } from "@/app/(app)/orders/_components/create-order-dialog";
import type { BranchOrderType } from "@prisma/client";

export interface CreateOrderPrefill {
  dealerId?: string;
  branchId?: string;
  brandId?: string;
}

interface OrdersCreateWorkspaceContextValue {
  canEdit: boolean;
  openCreate: (prefill?: CreateOrderPrefill) => void;
}

const OrdersCreateWorkspaceContext =
  createContext<OrdersCreateWorkspaceContextValue | null>(null);

export function useOrdersCreateWorkspace() {
  const ctx = useContext(OrdersCreateWorkspaceContext);
  if (!ctx) {
    throw new Error("useOrdersCreateWorkspace must be used within OrdersCreateWorkspaceProvider");
  }
  return ctx;
}

export function OrdersCreateWorkspaceProvider({
  orderType,
  canEdit,
  canCreateSpecial = false,
  children,
}: {
  orderType: BranchOrderType;
  canEdit: boolean;
  canCreateSpecial?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<CreateOrderPrefill | undefined>();

  const value = useMemo<OrdersCreateWorkspaceContextValue>(
    () => ({
      canEdit,
      openCreate: (next) => {
        if (orderType === "auto_replenish") {
          setPrefill(next);
          setOpen(true);
          return;
        }
        const params = new URLSearchParams();
        if (orderType === "manual" || orderType === "special") {
          params.set("type", orderType);
        }
        if (next?.dealerId) params.set("dealerId", next.dealerId);
        if (next?.branchId) params.set("branchId", next.branchId);
        if (next?.brandId) params.set("brandId", next.brandId);
        const query = params.toString();
        router.push(query ? `/orders/manual/new?${query}` : "/orders/manual/new");
      },
    }),
    [canEdit, orderType, router],
  );

  return (
    <OrdersCreateWorkspaceContext.Provider value={value}>
      {children}
      {open && orderType === "auto_replenish" ? (
        <CreateOrderDialog
          onClose={() => {
            setOpen(false);
            setPrefill(undefined);
          }}
          fixedOrderType={orderType}
          prefill={prefill}
          canCreateSpecial={canCreateSpecial}
        />
      ) : null}
    </OrdersCreateWorkspaceContext.Provider>
  );
}
