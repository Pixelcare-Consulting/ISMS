import { redirect } from "next/navigation";

import {
  firstAccessibleOrderType,
  ORDER_TYPE_ROUTE,
} from "@/features/orders/constants/order-permissions";
import { requireAuth } from "@/lib/auth/permissions";

export default async function OrdersIndexPage() {
  const session = await requireAuth();
  const orderType = firstAccessibleOrderType(session.user.permissions);
  if (!orderType) {
    redirect("/dashboard?error=forbidden");
  }
  redirect(ORDER_TYPE_ROUTE[orderType]);
}
