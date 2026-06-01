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
  "order.created": "Branch order created",
  "order.approved": "Branch order approved",
  "order.approval_step": "Branch order approval step",
  "order.rejected": "Branch order rejected",
  "delivery.created": "Delivery created",
  "delivery.accepted": "Delivery accepted",
  "transfer.created": "Branch transfer created",
  "pullout.created": "Pull-out created",
  "sale.created": "Sale recorded",
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
};

type AuditActionTone = "create" | "update" | "delete" | "neutral";

function getAuditActionTone(action: string): AuditActionTone {
  if (
    action.endsWith(".created") ||
    action.endsWith(".registered") ||
    action.endsWith(".granted") ||
    action.endsWith(".approved")
  ) {
    return "create";
  }

  if (
    action.endsWith(".deleted") ||
    action.endsWith(".removed") ||
    action.endsWith(".revoked")
  ) {
    return "delete";
  }

  if (
    action.endsWith(".updated") ||
    action.includes("profile") ||
    action.includes("password") ||
    action.includes("submitted") ||
    action.includes("reverted")
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

export function formatAuditEntitySummary(
  entityType: string,
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const data = metadata as Record<string, unknown>;
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
    return "No additional details";
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return String(metadata);
  }

  const data = metadata as Record<string, unknown>;
  const parts: string[] = [];

  const title = readMetadataString(data, "title");
  const name = readMetadataString(data, "name");
  const email = readMetadataString(data, "email");
  const slug = readMetadataString(data, "slug");
  const tagline = readMetadataString(data, "tagline");
  const status = readMetadataString(data, "status");
  const roleSlug = readMetadataString(data, "roleSlug");
  const permissionSlug = readMetadataString(data, "permissionSlug");

  if (title) {
    parts.push(`Title: ${title}`);
  }
  if (name && name !== title) {
    parts.push(`Name: ${name}`);
  }
  if (email) {
    parts.push(`Email: ${email}`);
  }
  if (slug && slug !== name) {
    parts.push(`Identifier: ${slug}`);
  }
  if (tagline) {
    parts.push(`Tagline: ${tagline}`);
  }
  if (status) {
    parts.push(`Status: ${titleCaseWords(status)}`);
  }

  if (action === "role.permission.granted") {
    parts.push(
      `Granted ${permissionSlug ?? "permission"} to ${roleSlug ?? "role"}`,
    );
  } else if (action === "role.permission.revoked") {
    parts.push(
      `Revoked ${permissionSlug ?? "permission"} from ${roleSlug ?? "role"}`,
    );
  }

  if (parts.length === 0) {
    return "No additional details";
  }

  return parts.join(" · ");
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
