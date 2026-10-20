import { Badge } from "@/components/ui/badge";
import type { OrderInventoryStatusCount } from "@/features/orders/types/order-analytics";
import { statusColorClassName } from "@/features/reason-status/constants/status-colors";
import { cn } from "@/utils/cn";

function inventoryChipClassName(code: string, color?: string | null): string {
  return cn("font-mono text-[10px] font-normal", statusColorClassName(color, code));
}

export function InventoryStatusChips({
  inventory,
}: {
  inventory: OrderInventoryStatusCount[];
}) {
  if (inventory.length === 0) {
    return (
      <Badge variant="outline" className={inventoryChipClassName("STK", null)}>
        STK 0
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {inventory.map((row) => (
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
