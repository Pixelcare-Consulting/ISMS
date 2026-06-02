const AUDIT_ACTION_LABELS: Record<string, string> = {
  "tenant.registered": "Organization registered",
  "company.updated": "Company settings updated",
  "company.logo.updated": "Company logo updated",
  "company.logo.removed": "Company logo removed",
  "user.created": "User invited",
  "user.updated": "User updated",
  "user.deleted": "User removed",
  "user.profile_updated": "Profile updated",
  "user.password_changed": "Password changed",
  "department.created": "Department created",
  "department.updated": "Department updated",
  "department.deleted": "Department removed",
  "role.created": "Role created",
  "role.updated": "Role updated",
  "role.deleted": "Role removed",
  "role.permission.granted": "Permission granted",
  "role.permission.revoked": "Permission revoked",
  "permission.created": "Permission created",
  "permission.updated": "Permission updated",
  "permission.deleted": "Permission removed",
  "policy.created": "Policy created",
  "policy.updated": "Policy updated",
  "policy.deleted": "Policy removed",
  "policy.reverted_to_draft": "Policy reverted to draft",
  "policy.submitted_for_review": "Policy submitted for review",
  "policy.approved": "Policy approved",
  "policy.revision_created": "Policy revision created",
  "policy.attachment_uploaded": "Policy attachment uploaded",
  "branch.created": "Branch created",
  "branch.updated": "Branch updated",
  "branch.deleted": "Branch removed",
  "inventory.status_changed": "Inventory status changed",
  "inventory.status_updated": "Inventory status changed",
  "order.created": "Branch order created",
  "order.approved": "Branch order approved",
  "order.approval_step": "Branch order approval step",
  "order.rejected": "Branch order rejected",
  "delivery.created": "Delivery created",
  "delivery.accepted": "Delivery accepted",
  "delivery.rejected": "Delivery rejected",
  "delivery.created_from_order": "Delivery created from order",
  "transfer.created": "Branch transfer created",
  "pullout.created": "Pull-out created",
  "sale.created": "Sale recorded",
  "sale.reserved": "Reserved sale recorded",
  "sale.return_requested": "Return request submitted",
  "return.evaluated": "Return evaluated by CS",
  "return.approved": "Return approved by TL",
  "return.rejected": "Return rejected",
  "return.completed": "Return completed — stock restored",
  "transfer.executed": "Transfer executed",
  "transfer.received": "Transfer received",
  "pullout.completed": "Pull-out completed",
  "warehouse.created": "Warehouse created",
  "warehouse.updated": "Warehouse updated",
  "warehouse.deleted": "Warehouse removed",
  "warehouse.location_created": "Warehouse location added",
  "warehouse.location_deleted": "Warehouse location removed",
  "stock_count.session_created": "Stock count session created",
  "stock_count.started": "Stock count started",
  "stock_count.line_recorded": "Stock count line recorded",
  "stock_count.completed": "Stock count completed",
  "stock_count.variance_investigated": "Stock variance investigated",
  "stock_count.adjustment_requested": "Stock adjustment requested",
  "stock_count.session_closed": "Stock count session closed",
  "sap.order_processed": "SAP order processed",
  "sap.service_layer.updated": "SAP Service Layer settings updated",
  "sap.inventory_adjustment_processed": "SAP inventory adjustment processed",
  "sap.job_failed": "SAP job failed",
  "sap.job_dead_letter": "SAP job dead letter",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Tenant: "Company",
  User: "User",
  Department: "Department",
  Role: "Role",
  Permission: "Permission",
  Policy: "Policy",
  Branch: "Branch",
  BranchInventory: "Inventory",
  BranchOrder: "Branch order",
  BranchDelivery: "Delivery",
  BranchTransfer: "Transfer",
  BranchPullout: "Pull-out",
  BranchSalesTransaction: "Sale",
  BranchReturnRequest: "Return request",
  Warehouse: "Warehouse",
  WarehouseLocation: "Warehouse location",
  StockCountSession: "Stock count session",
  StockCountLine: "Stock count line",
  StockVariance: "Stock variance",
  SapIntegrationJob: "SAP integration job",
  SapServiceLayerConfig: "SAP Service Layer config",
};

const OPERATIONAL_SUMMARY_KEYS = [
  "orderNumber",
  "deliveryNo",
  "transferNo",
  "pulloutNo",
  "branchName",
] as const;

const GENERIC_DETAIL_KEYS = [
  "branchName",
  "orderNumber",
  "deliveryNo",
  "transferNo",
  "pulloutNo",
  "orderType",
  "linesSummary",
  "reasonName",
  "comment",
  "roleSlug",
  "from",
  "to",
  "statusCode",
  "statusName",
] as const;

type AuditActionTone = "create" | "update" | "delete" | "neutral";

function getAuditActionTone(action: string): AuditActionTone {
  if (
    action.endsWith(".created") ||
    action.endsWith(".registered") ||
    action.endsWith(".granted") ||
    action.endsWith(".approved") ||
    action.endsWith(".accepted")
  ) {
    return "create";
  }

  if (
    action.endsWith(".deleted") ||
    action.endsWith(".removed") ||
    action.endsWith(".revoked") ||
    action.endsWith(".rejected")
  ) {
    return "delete";
  }

  if (
    action.endsWith(".updated") ||
    action.includes("profile") ||
    action.includes("password") ||
    action.includes("submitted") ||
    action.includes("reverted") ||
    action.includes("approval_step")
  ) {
    return "update";
  }

  return "neutral";
}

function titleCaseWords(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatOrderTypeLabel(orderType: string): string {
  switch (orderType) {
    case "manual":
      return "Manual";
    case "special":
      return "Special";
    case "auto_replenish":
      return "Auto replenish";
    default:
      return titleCaseWords(orderType);
  }
}

function formatStatusLabel(status: string): string {
  return titleCaseWords(status);
}

function formatRoleSlugLabel(roleSlug: string): string {
  switch (roleSlug) {
    case "ps":
      return "Product Specialist";
    case "tl":
      return "Team Leader";
    case "sp":
      return "Supply Planning";
    case "logistics":
      return "Logistics";
    default:
      return titleCaseWords(roleSlug);
  }
}

export function formatAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? titleCaseWords(action);
}

export function formatAuditEntityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function getAuditActionBadgeClassName(action: string): string {
  const tone = getAuditActionTone(action);

  switch (tone) {
    case "create":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "update":
      return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100";
    case "delete":
      return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function getAuditEntityBadgeClassName(entityType: string): string {
  switch (entityType) {
    case "Policy":
      return "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100";
    case "User":
      return "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100";
    case "Role":
    case "Permission":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";
    case "Department":
      return "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100";
    case "Tenant":
      return "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100";
    case "BranchOrder":
      return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100";
    case "BranchDelivery":
      return "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-100";
    case "BranchTransfer":
      return "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100";
    case "BranchPullout":
      return "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100";
    case "BranchSalesTransaction":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "BranchInventory":
      return "border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-900 dark:bg-lime-950 dark:text-lime-100";
    default:
      return "border-border bg-secondary text-secondary-foreground";
  }
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatActionFallback(action: string): string {
  const label = formatAuditActionLabel(action);
  if (label !== titleCaseWords(action)) {
    return `${label} recorded`;
  }
  return `${titleCaseWords(action)} recorded`;
}

function formatOperationalAuditDetails(
  action: string,
  data: Record<string, unknown>,
): string | null {
  const branchName = readMetadataString(data, "branchName");
  const orderNumber = readMetadataString(data, "orderNumber");
  const deliveryNo = readMetadataString(data, "deliveryNo");
  const transferNo = readMetadataString(data, "transferNo");
  const pulloutNo = readMetadataString(data, "pulloutNo");
  const orderType = readMetadataString(data, "orderType");
  const linesSummary = readMetadataString(data, "linesSummary");
  const from = readMetadataString(data, "from");
  const to = readMetadataString(data, "to");
  const roleSlug = readMetadataString(data, "roleSlug");
  const reasonName = readMetadataString(data, "reasonName");
  const comment = readMetadataString(data, "comment");
  const statusName = readMetadataString(data, "statusName");
  const statusCode = readMetadataString(data, "statusCode");

  switch (action) {
    case "order.created": {
      const typeLabel = orderType ? formatOrderTypeLabel(orderType) : "Order";
      const parts = [`${typeLabel} order`];
      if (branchName) parts[0] = `${typeLabel} order at ${branchName}`;
      if (linesSummary) parts.push(`Lines: ${linesSummary}`);
      if (orderNumber) parts.push(orderNumber);
      return parts.join(" · ");
    }
    case "order.approval_step":
    case "order.approved": {
      const typeLabel = orderType ? formatOrderTypeLabel(orderType) : "Order";
      const stepLabel = roleSlug ? formatRoleSlugLabel(roleSlug) : "Approval";
      const transition =
        from && to
          ? `${formatStatusLabel(from)} → ${formatStatusLabel(to)}`
          : to
            ? formatStatusLabel(to)
            : null;
      const parts = [`${typeLabel} order · ${stepLabel} step`];
      if (transition) parts.push(transition);
      if (orderNumber) parts.push(orderNumber);
      if (branchName) parts.push(branchName);
      return parts.join(" · ");
    }
    case "order.rejected": {
      const typeLabel = orderType ? formatOrderTypeLabel(orderType) : "Order";
      const parts = [`${typeLabel} order rejected`];
      if (branchName) parts.push(branchName);
      if (orderNumber) parts.push(orderNumber);
      if (comment) parts.push(`Reason: ${comment}`);
      return parts.join(" · ");
    }
    case "delivery.created":
    case "delivery.accepted":
    case "delivery.rejected":
    case "delivery.created_from_order": {
      const parts: string[] = [];
      if (deliveryNo) parts.push(deliveryNo);
      if (branchName) parts.push(`at ${branchName}`);
      if (orderNumber) parts.push(`Order ${orderNumber}`);
      if (parts.length === 0) return null;
      return parts.join(" · ");
    }
    case "transfer.created": {
      const parts: string[] = [];
      if (transferNo) parts.push(transferNo);
      if (from && to) parts.push(`${from} → ${to}`);
      else if (branchName) parts.push(branchName);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "pullout.created": {
      const parts: string[] = [];
      if (pulloutNo) parts.push(pulloutNo);
      if (branchName) parts.push(branchName);
      if (reasonName) parts.push(`Reason: ${reasonName}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "sale.created": {
      const parts: string[] = [];
      if (branchName) parts.push(`Sale at ${branchName}`);
      if (linesSummary) parts.push(linesSummary);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "inventory.status_updated":
    case "inventory.status_changed": {
      if (statusName || statusCode) {
        return `Status → ${statusName ?? formatStatusLabel(statusCode ?? "")}`;
      }
      return null;
    }
    default:
      return null;
  }
}

function formatGenericOperationalDetails(data: Record<string, unknown>): string | null {
  const parts: string[] = [];
  const from = readMetadataString(data, "from");
  const to = readMetadataString(data, "to");

  if (from && to) {
    parts.push(`${formatStatusLabel(from)} → ${formatStatusLabel(to)}`);
  } else if (from) {
    parts.push(`From: ${formatStatusLabel(from)}`);
  } else if (to) {
    parts.push(`To: ${formatStatusLabel(to)}`);
  }

  for (const key of GENERIC_DETAIL_KEYS) {
    if (key === "from" || key === "to") continue;
    const value = readMetadataString(data, key);
    if (!value) continue;

    switch (key) {
      case "orderType":
        parts.push(`Type: ${formatOrderTypeLabel(value)}`);
        break;
      case "roleSlug":
        parts.push(`Role: ${formatRoleSlugLabel(value)}`);
        break;
      case "linesSummary":
        parts.push(`Lines: ${value}`);
        break;
      case "reasonName":
        parts.push(`Reason: ${value}`);
        break;
      case "comment":
        parts.push(`Comment: ${value}`);
        break;
      case "statusCode":
      case "statusName":
        if (!parts.some((p) => p.startsWith("Status"))) {
          parts.push(`Status: ${key === "statusName" ? value : formatStatusLabel(value)}`);
        }
        break;
      default:
        parts.push(`${titleCaseWords(key)}: ${value}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatAdminAuditDetails(
  data: Record<string, unknown>,
  action: string,
): string | null {
  const parts: string[] = [];

  const title = readMetadataString(data, "title");
  const name = readMetadataString(data, "name");
  const email = readMetadataString(data, "email");
  const slug = readMetadataString(data, "slug");
  const tagline = readMetadataString(data, "tagline");
  const status = readMetadataString(data, "status");
  const roleSlug = readMetadataString(data, "roleSlug");
  const permissionSlug = readMetadataString(data, "permissionSlug");

  if (title) parts.push(`Title: ${title}`);
  if (name && name !== title) parts.push(`Name: ${name}`);
  if (email) parts.push(`Email: ${email}`);
  if (slug && slug !== name) parts.push(`Identifier: ${slug}`);
  if (tagline) parts.push(`Tagline: ${tagline}`);
  if (status) parts.push(`Status: ${formatStatusLabel(status)}`);

  if (action === "role.permission.granted") {
    parts.push(
      `Granted ${permissionSlug ?? "permission"} to ${roleSlug ?? "role"}`,
    );
  } else if (action === "role.permission.revoked") {
    parts.push(
      `Revoked ${permissionSlug ?? "permission"} from ${roleSlug ?? "role"}`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatAuditEntitySummary(
  entityType: string,
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const data = metadata as Record<string, unknown>;

  for (const key of OPERATIONAL_SUMMARY_KEYS) {
    const value = readMetadataString(data, key);
    if (value) return value;
  }

  return (
    readMetadataString(data, "title") ??
    readMetadataString(data, "name") ??
    readMetadataString(data, "email") ??
    readMetadataString(data, "slug") ??
    null
  );
}

export function formatAuditDetails(
  metadata: unknown,
  action: string,
): string {
  if (metadata === null || metadata === undefined) {
    return formatActionFallback(action);
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return String(metadata);
  }

  const data = metadata as Record<string, unknown>;

  const operational =
    formatOperationalAuditDetails(action, data) ??
    formatGenericOperationalDetails(data);
  if (operational) return operational;

  const admin = formatAdminAuditDetails(data, action);
  if (admin) return admin;

  return formatActionFallback(action);
}

export function formatAuditTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
