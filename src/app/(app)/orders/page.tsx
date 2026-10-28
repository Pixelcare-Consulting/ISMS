import { redirect } from "next/navigation";

import { ordersHomeHref } from "@/features/orders/constants/order-permissions";
import { requireAuth } from "@/lib/auth/permissions";

export default async function OrdersIndexPage() {
  const session = await requireAuth();
  const href = ordersHomeHref(session.user.permissions);
  if (!href) {
    redirect("/dashboard?error=forbidden");
  }
  redirect(href);
}
