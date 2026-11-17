/** Client-safe labels for the SC Returns page (Process V-b). */

export type ScServiceReturnStatus = "pending_sc" | "awaiting_stock" | "completed" | "rejected";

export const SC_SERVICE_RETURN_STATUS_META: Record<
  ScServiceReturnStatus,
  { label: string; color: string }
> = {
  pending_sc: { label: "Pending SC", color: "amber" },
  awaiting_stock: { label: "Awaiting Stock", color: "sky" },
  completed: { label: "Completed", color: "emerald" },
  rejected: { label: "Rejected", color: "rose" },
};

export const SC_SERVICE_RETURN_FILTER_LABELS = {
  open: "Open",
  pending_sc: "Pending SC",
  awaiting_stock: "Awaiting Stock",
  completed: "Completed",
  rejected: "Rejected",
  all: "All",
} as const;

export function scServiceActionLabel(actionType: "return" | "replacement"): string {
  return actionType === "replacement" ? "Service Replacement" : "Service Return";
}

export function scServiceReturnsHref(params: {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
  request?: string;
}): string {
  const search = new URLSearchParams();
  if (params.status && params.status !== "open") search.set("status", params.status);
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.request) search.set("request", params.request);
  const query = search.toString();
  return query ? `/service-centers/returns?${query}` : "/service-centers/returns";
}
