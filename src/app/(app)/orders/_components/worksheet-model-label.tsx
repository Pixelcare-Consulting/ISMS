import { displayModelName } from "@/features/orders/lib/worksheet-model-display";

/**
 * SKU/Model cell shared by the order sheet and order analytics.
 * Line 1 is the code. Line 2 is the name, at the same size as the shelf-max line.
 */
export function WorksheetModelLabel({ skuCode, name }: { skuCode: string; name: string }) {
  const modelName = displayModelName(skuCode, name);
  return (
    <div className="min-w-0 space-y-0.5 overflow-visible whitespace-normal">
      <p className="break-words whitespace-normal font-medium">{skuCode}</p>
      {modelName ? (
        <p className="break-words whitespace-normal text-[11px] font-normal leading-tight text-muted-foreground">
          {modelName}
        </p>
      ) : null}
    </div>
  );
}
