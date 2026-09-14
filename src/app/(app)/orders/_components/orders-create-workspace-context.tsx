"use client";

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
  canAccessSuggestedOrders,
  children,
}: {
  orderType: BranchOrderType;
  canEdit: boolean;
  canAccessSuggestedOrders: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<CreateOrderPrefill | undefined>();

  const value = useMemo<OrdersCreateWorkspaceContextValue>(
    () => ({
      canEdit,
      openCreate: (next) => {
        setPrefill(next);
        setOpen(true);
      },
    }),
    [canEdit],
  );

  return (
    <OrdersCreateWorkspaceContext.Provider value={value}>
      {children}
      {open ? (
        <CreateOrderDialog
          onClose={() => {
            setOpen(false);
            setPrefill(undefined);
          }}
          fixedOrderType={orderType}
          canAccessSuggestedOrders={canAccessSuggestedOrders}
          prefill={prefill}
        />
      ) : null}
    </OrdersCreateWorkspaceContext.Provider>
  );
}
