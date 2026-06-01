import type { BranchOrderStatus } from "@prisma/client";

export const ORDER_APPROVAL_CHAIN = [
  { level: 1, roleSlug: "tl", status: "pending_tl" as BranchOrderStatus },
  { level: 2, roleSlug: "sp", status: "pending_sp" as BranchOrderStatus },
  { level: 3, roleSlug: "logistics", status: "pending_logistics" as BranchOrderStatus },
] as const;

export function nextStatusAfterApprove(current: BranchOrderStatus): BranchOrderStatus {
  if (current === "draft" || current === "pending_tl") return "pending_sp";
  if (current === "pending_sp") return "pending_logistics";
  if (current === "pending_logistics") return "approved";
  return current;
}

export function canApproveOrder(
  status: BranchOrderStatus,
  roleSlugs: string[],
): boolean {
  if (status === "pending_tl" && roleSlugs.includes("tl")) return true;
  if (status === "pending_sp" && roleSlugs.includes("sp")) return true;
  if (status === "pending_logistics" && roleSlugs.includes("logistics")) return true;
  return false;
}
