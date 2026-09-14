import { Badge } from "@/components/ui/badge";
import type { OrderInventoryStatusCount } from "@/features/orders/types/order-analytics";

export function InventoryStatusChips({
  inventory,
}: {
  inventory: OrderInventoryStatusCount[];
}) {
  if (inventory.length === 0) {
    return (
      <Badge variant="outline" className="font-mono text-[10px]">
        STK 0
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {inventory.map((row) => (
        <Badge key={row.code} variant="outline" className="font-mono text-[10px]">
          {row.code} {row.count}
        </Badge>
      ))}
    </div>
  );
}
