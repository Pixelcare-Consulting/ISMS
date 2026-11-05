import { Badge } from "@/components/ui/badge";
import type { OrderInventoryStatusCount } from "@/features/orders/types/order-analytics";
import { statusColorClassName } from "@/features/reason-status/constants/status-colors";
import { cn } from "@/utils/cn";

/** Sold units are not stock the branch can order against, so Orders never shows them. */
const HIDDEN_ORDER_INVENTORY_CODES = new Set(["SLD"]);

function inventoryChipClassName(code: string, color?: string | null): string {
  return cn("font-mono text-[10px] font-normal", statusColorClassName(color, code));
}

export function InventoryStatusChips({
  inventory,
  stacked = false,
}: {
  inventory: OrderInventoryStatusCount[];
  /** One chip per line. Supply Planning review stacks statuses. */
  stacked?: boolean;
}) {
  const visible = inventory.filter((row) => !HIDDEN_ORDER_INVENTORY_CODES.has(row.code));
  if (visible.length === 0) {
    return (
      <Badge variant="outline" className={inventoryChipClassName("STK", null)}>
        STK 0
      </Badge>
    );
  }

  return (
    <div className={stacked ? "flex flex-col items-start gap-1" : "flex flex-wrap gap-1"}>
      {visible.map((row) => (
        <Badge
          key={row.code}
          variant="outline"
          className={inventoryChipClassName(row.code, row.color)}
        >
          {row.code} {row.count}
        </Badge>
      ))}
    </div>
  );
}
