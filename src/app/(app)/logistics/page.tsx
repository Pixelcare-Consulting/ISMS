import { redirect } from "next/navigation";

import { LOGISTICS_DELIVERIES_PATH } from "@/app/(app)/logistics/_components/logistics-paths";

export default function LogisticsPage() {
  redirect(LOGISTICS_DELIVERIES_PATH);
}
