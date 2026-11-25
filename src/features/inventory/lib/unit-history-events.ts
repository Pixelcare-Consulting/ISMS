import { unitHistoryRoleLabel } from "@/features/inventory/lib/unit-history-role";

/** Newest events kept. The drawer still shows the oldest of that set first. */
export const UNIT_HISTORY_LIMIT = 40;

export type UnitHistoryActor = {
  name: string | null;
  email: string;
  roleSlugs: readonly string[];
};

export type UnitHistoryEvent = {
  id: string;
  at: string;
  label: string;
  actor: string | null;
};

type ApprovalLevel = {
  approvedAt: Date | null;
  approvedBy: UnitHistoryActor | null;
  rejectedAt: Date | null;
  rejectedBy: UnitHistoryActor | null;
};

export type UnitHistorySnapshot = {
  placement: {
    id: string;
    at: Date;
    statusName: string;
    actor: UnitHistoryActor | null;
  } | null;
  statusChanges: Array<{
    id: string;
    at: Date;
    details: string | null;
    status: string | null;
    actor: UnitHistoryActor | null;
  }>;
  deliveries: Array<{
    id: string;
    at: Date;
    statusName: string;
    actor: UnitHistoryActor | null;
  }>;
  transfers: Array<{
    id: string;
    requestedAt: Date;
    requestedBy: UnitHistoryActor | null;
    approvals: ApprovalLevel[];
    decision: string;
    decidedAt: Date | null;
    decidedBy: UnitHistoryActor | null;
  }>;
  deliveryTransfers: Array<{
    id: string;
    requestedAt: Date;
    requestedBy: UnitHistoryActor | null;
    lineStatus: "PENDING" | "APPROVED" | "REMOVED" | "RECEIVED";
    decidedAt: Date | null;
    decidedBy: UnitHistoryActor | null;
  }>;
  pullouts: Array<{
    id: string;
    requestedAt: Date;
    requestedBy: UnitHistoryActor | null;
    approvals: ApprovalLevel[];
    decision: string;
    decidedAt: Date | null;
    decidedBy: UnitHistoryActor | null;
    rejectedAt: Date | null;
    rejectedBy: UnitHistoryActor | null;
  }>;
  sales: Array<{
    id: string;
    at: Date;
    actor: UnitHistoryActor | null;
  }>;
  returns: Array<{
    id: string;
    action: "return" | "replacement";
    requestedAt: Date;
    requestedBy: UnitHistoryActor | null;
    approvedAt: Date | null;
    approvedBy: UnitHistoryActor | null;
  }>;
  deliveryReturns: Array<{
    id: string;
    status: "PENDING_APPROVAL" | "APPROVED" | "COMPLETED" | "CANCELLED";
    requestedAt: Date;
    requestedBy: UnitHistoryActor | null;
    decidedAt: Date | null;
    decidedBy: UnitHistoryActor | null;
  }>;
  stockCounts: Array<{
    id: string;
    at: Date;
    actor: UnitHistoryActor | null;
  }>;
};

type Draft = {
  id: string;
  at: Date;
  label: string;
  actor: string | null;
};

function personName(actor: UnitHistoryActor | null | undefined): string | null {
  if (!actor) return null;
  const name = actor.name?.trim();
  if (name) return name;
  const email = actor.email.trim();
  return email.length > 0 ? email : null;
}

function approvalLabel(
  document: string,
  outcome: "approved" | "rejected",
  roleSlugs: readonly string[],
): string {
  const verb = outcome === "approved" ? "approved" : "rejected";
  const role = unitHistoryRoleLabel(roleSlugs);
  const base = `${document} ${verb}`;
  return role ? `${base} by ${role}` : base;
}

function push(events: Draft[], event: Draft | null) {
  if (!event || Number.isNaN(event.at.getTime())) return;
  events.push(event);
}

function approvalDrafts(idPrefix: string, document: string, levels: readonly ApprovalLevel[]): Draft[] {
  const drafts: Draft[] = [];
  levels.forEach((level, index) => {
    if (level.rejectedAt) {
      push(drafts, {
        id: `${idPrefix}:rejected:${index}`,
        at: level.rejectedAt,
        label: approvalLabel(document, "rejected", level.rejectedBy?.roleSlugs ?? []),
        actor: personName(level.rejectedBy),
      });
      return;
    }
    if (level.approvedAt) {
      push(drafts, {
        id: `${idPrefix}:approved:${index}`,
        at: level.approvedAt,
        label: approvalLabel(document, "approved", level.approvedBy?.roleSlugs ?? []),
        actor: personName(level.approvedBy),
      });
    }
  });
  return drafts;
}

function deliveryTransferDecision(
  row: UnitHistorySnapshot["deliveryTransfers"][number],
): Draft | null {
  if (!row.decidedAt) return null;
  const actor = personName(row.decidedBy);
  switch (row.lineStatus) {
    case "PENDING":
      return null;
    case "APPROVED":
      return {
        id: `delivery-transfer:${row.id}:approved`,
        at: row.decidedAt,
        label: approvalLabel("Transfer", "approved", row.decidedBy?.roleSlugs ?? []),
        actor,
      };
    case "RECEIVED":
      return {
        id: `delivery-transfer:${row.id}:accepted`,
        at: row.decidedAt,
        label: "Transfer accepted",
        actor,
      };
    case "REMOVED":
      return {
        id: `delivery-transfer:${row.id}:rejected`,
        at: row.decidedAt,
        label: "Transfer rejected",
        actor,
      };
    default: {
      const unexpected: never = row.lineStatus;
      return unexpected;
    }
  }
}

function returnDocument(action: UnitHistorySnapshot["returns"][number]["action"]): string {
  switch (action) {
    case "return":
      return "Return";
    case "replacement":
      return "Replacement";
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function returnDecision(row: UnitHistorySnapshot["returns"][number]): Draft | null {
  if (!row.approvedAt) return null;
  const document = returnDocument(row.action);
  return {
    id: `return:${row.id}:approved`,
    at: row.approvedAt,
    label: approvalLabel(document, "approved", row.approvedBy?.roleSlugs ?? []),
    actor: personName(row.approvedBy),
  };
}

function deliveryReturnDecision(row: UnitHistorySnapshot["deliveryReturns"][number]): Draft | null {
  if (!row.decidedAt) return null;
  const actor = personName(row.decidedBy);
  const roleSlugs = row.decidedBy?.roleSlugs ?? [];
  switch (row.status) {
    case "PENDING_APPROVAL":
      return null;
    case "APPROVED":
    case "COMPLETED":
      return {
        id: `delivery-return:${row.id}:approved`,
        at: row.decidedAt,
        label: approvalLabel("Delivery return", "approved", roleSlugs),
        actor,
      };
    case "CANCELLED":
      return {
        id: `delivery-return:${row.id}:rejected`,
        at: row.decidedAt,
        label: approvalLabel("Delivery return", "rejected", roleSlugs),
        actor,
      };
    default: {
      const unexpected: never = row.status;
      return unexpected;
    }
  }
}

function statusLabel(details: string | null, status: string | null): string {
  const written = details?.trim();
  if (written) return written;
  const code = status?.trim();
  return code ? `Status ${code}` : "Status changed";
}

function collect(snapshot: UnitHistorySnapshot): Draft[] {
  const events: Draft[] = [];
  const placementName = snapshot.placement?.statusName.trim() ?? "";
  if (snapshot.placement && placementName) {
    push(events, {
      id: `placement:${snapshot.placement.id}`,
      at: snapshot.placement.at,
      label: placementName,
      actor: personName(snapshot.placement.actor),
    });
  }

  for (const row of snapshot.statusChanges) {
    push(events, {
      id: `status:${row.id}`,
      at: row.at,
      label: statusLabel(row.details, row.status),
      actor: personName(row.actor),
    });
  }

  for (const row of snapshot.deliveries) {
    const statusName = row.statusName.trim();
    push(events, {
      id: `delivery:${row.id}`,
      at: row.at,
      label: statusName ? `Delivery · ${statusName}` : "Delivery",
      actor: personName(row.actor),
    });
  }

  for (const row of snapshot.transfers) {
    push(events, {
      id: `transfer:${row.id}:requested`,
      at: row.requestedAt,
      label: "Transfer requested",
      actor: personName(row.requestedBy),
    });
    events.push(...approvalDrafts(`transfer:${row.id}`, "Transfer", row.approvals));
    if (row.decidedAt && row.decision === "accepted") {
      push(events, {
        id: `transfer:${row.id}:accepted`,
        at: row.decidedAt,
        label: "Transfer accepted",
        actor: personName(row.decidedBy),
      });
    }
    if (row.decidedAt && row.decision === "rejected") {
      push(events, {
        id: `transfer:${row.id}:rejected`,
        at: row.decidedAt,
        label: "Transfer rejected",
        actor: personName(row.decidedBy),
      });
    }
  }

  for (const row of snapshot.deliveryTransfers) {
    push(events, {
      id: `delivery-transfer:${row.id}:requested`,
      at: row.requestedAt,
      label: "Transfer requested",
      actor: personName(row.requestedBy),
    });
    push(events, deliveryTransferDecision(row));
  }

  for (const row of snapshot.pullouts) {
    push(events, {
      id: `pullout:${row.id}:requested`,
      at: row.requestedAt,
      label: "Pull-out requested",
      actor: personName(row.requestedBy),
    });
    events.push(...approvalDrafts(`pullout:${row.id}`, "Pull-out", row.approvals));
    if (row.decidedAt && row.decision === "accepted") {
      push(events, {
        id: `pullout:${row.id}:accepted`,
        at: row.decidedAt,
        label: "Pull-out accepted",
        actor: personName(row.decidedBy),
      });
    }
    if (row.rejectedAt) {
      push(events, {
        id: `pullout:${row.id}:rejected`,
        at: row.rejectedAt,
        label: "Pull-out rejected",
        actor: personName(row.rejectedBy),
      });
    }
  }

  for (const row of snapshot.sales) {
    push(events, {
      id: `sale:${row.id}`,
      at: row.at,
      label: "Sale",
      actor: personName(row.actor),
    });
  }

  for (const row of snapshot.returns) {
    push(events, {
      id: `return:${row.id}:requested`,
      at: row.requestedAt,
      label: returnDocument(row.action),
      actor: personName(row.requestedBy),
    });
    push(events, returnDecision(row));
  }

  for (const row of snapshot.deliveryReturns) {
    push(events, {
      id: `delivery-return:${row.id}:requested`,
      at: row.requestedAt,
      label: "Delivery return",
      actor: personName(row.requestedBy),
    });
    push(events, deliveryReturnDecision(row));
  }

  for (const row of snapshot.stockCounts) {
    push(events, {
      id: `count:${row.id}`,
      at: row.at,
      label: "Stock count",
      actor: personName(row.actor),
    });
  }

  return events;
}

/** Oldest first, capped to the newest events so a long serial still shows recent history. */
export function buildUnitHistoryEvents(snapshot: UnitHistorySnapshot): UnitHistoryEvent[] {
  const sorted = collect(snapshot).sort((a, b) => {
    const time = a.at.getTime() - b.at.getTime();
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });
  const capped =
    sorted.length > UNIT_HISTORY_LIMIT ? sorted.slice(sorted.length - UNIT_HISTORY_LIMIT) : sorted;
  return capped.map((event) => ({
    id: event.id,
    at: event.at.toISOString(),
    label: event.label,
    actor: event.actor,
  }));
}
