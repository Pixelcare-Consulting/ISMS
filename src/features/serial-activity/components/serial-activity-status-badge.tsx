import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import type { StatusColorKey } from "@/features/reason-status/constants/status-colors";

interface SerialActivityStatusBadgeModel {
  code: string;
  name: string;
  color: StatusColorKey;
}

/** Labels that already have a color elsewhere in sales and inventory. */
const EXACT_STATUS: Record<string, { code: string; color: StatusColorKey }> = {
  Replaced: { code: "replaced", color: "violet" },
  "Service Replaced": { code: "service_replaced", color: "teal" },
  Returned: { code: "returned", color: "violet" },
  "Service Returned": { code: "service_returned", color: "teal" },
  "Returned/Replaced": { code: "returned_replaced", color: "violet" },
  "Service Returned/Replaced": { code: "service_returned_replaced", color: "teal" },
  "Reserve ODRF": { code: "ODRF", color: "orange" },
  "Record: Active": { code: "active", color: "emerald" },
  "Record: Inactive": { code: "inactive", color: "slate" },
  "Inventory: Sold": { code: "SLD", color: "slate" },
  "Inventory: Reserved": { code: "RSV", color: "orange" },
  "Inventory: Official Sold": { code: "OFS", color: "teal" },
};

const INVENTORY_BY_NAME: Record<string, { code: string; color: StatusColorKey }> = {
  "delivery in transit": { code: "DIT", color: "sky" },
  stock: { code: "STK", color: "emerald" },
  "display unit": { code: "DU", color: "amber" },
  sold: { code: "SLD", color: "slate" },
  "official sold": { code: "OFS", color: "teal" },
  reserved: { code: "RSV", color: "orange" },
  defective: { code: "DEF", color: "rose" },
  "for pull-out": { code: "FPO", color: "violet" },
  "to follow": { code: "FW", color: "orange" },
  "for transfer": { code: "FTR", color: "violet" },
  "pulled out": { code: "PO", color: "slate" },
  "reserve odrf": { code: "ODRF", color: "orange" },
};

const INVENTORY_BY_CODE: Record<string, StatusColorKey> = {
  DIT: "sky",
  STK: "emerald",
  DU: "amber",
  SLD: "slate",
  OFS: "teal",
  RSV: "orange",
  DEF: "rose",
  FPO: "violet",
  FW: "orange",
  FTR: "violet",
  PO: "slate",
  ODRF: "orange",
};

function inventoryToken(token: string): { code: string; color: StatusColorKey } | null {
  const named = INVENTORY_BY_NAME[token.trim().toLowerCase()];
  if (named) return named;
  const code = token.trim().toUpperCase();
  const color = INVENTORY_BY_CODE[code];
  if (!color) return null;
  return { code, color };
}

/** Badge colors for a serial-log status. Unknown labels stay on a neutral badge. */
export function serialActivityStatusBadge(status: string): SerialActivityStatusBadgeModel {
  const name = status.trim();
  const exact = EXACT_STATUS[name];
  if (exact) return { name, code: exact.code, color: exact.color };

  const inventoryCode = INVENTORY_BY_CODE[name.toUpperCase()];
  if (inventoryCode && name.length <= 6) {
    return { name, code: name.toUpperCase(), color: inventoryCode };
  }

  const prefixed = /^(?:Inventory|Received|Back at branch):\s*(.+)$/iu.exec(name);
  if (prefixed?.[1]) {
    const match = inventoryToken(prefixed[1]);
    if (match) return { name, code: match.code, color: match.color };
  }

  if (/^Transfer:/iu.test(name)) return { name, code: "transfer", color: "violet" };
  if (/^Pullout:/iu.test(name)) return { name, code: "pullout", color: "violet" };
  if (/^Return:/iu.test(name)) return { name, code: "return", color: "violet" };
  if (/^Count:/iu.test(name)) return { name, code: "count", color: "sky" };
  if (/^Action Key:/iu.test(name)) return { name, code: "official_sales", color: "teal" };

  return { name, code: name, color: "slate" };
}

export function SerialActivityStatusBadge({ status }: { status: string }) {
  const badge = serialActivityStatusBadge(status);
  return <StatusCodeBadge code={badge.code} name={badge.name} color={badge.color} />;
}
