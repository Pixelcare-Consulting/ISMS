import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

const SALES_SKELETON_COLUMNS = [
  "ID",
  "TRN NO.",
  "DATE",
  "BRANCH",
  "CUSTOMER",
  "SN",
  "SALE",
  "STATUS",
  "ACTIONS",
] as const;

const RETURNS_SKELETON_COLUMNS = [
  "TRN NO.",
  "DATE",
  "BRANCH",
  "CUSTOMER",
  "RETURN STATUS",
  "ACTIONS",
] as const;

export function SalesTabTableSkeleton({ tab }: { tab: "sales" | "returns" }) {
  switch (tab) {
    case "returns":
      return (
        <DataTableSkeleton
          columns={[...RETURNS_SKELETON_COLUMNS]}
          label="Loading returns"
        />
      );
    case "sales":
      return (
        <DataTableSkeleton
          columns={[...SALES_SKELETON_COLUMNS]}
          label="Loading sales"
        />
      );
    default: {
      const _exhaustive: never = tab;
      void _exhaustive;
      return null;
    }
  }
}
