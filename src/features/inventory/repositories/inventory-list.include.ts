export const inventoryListInclude = {
  branch: { select: { id: true, name: true, sapCode: true } },
  statusCode: { select: { id: true, code: true, name: true, color: true } },
  serialNumber: {
    include: {
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          srp: true,
          brand: { select: { name: true } },
        },
      },
    },
  },
} as const;

/** Explicit list row (include shape) so PaginatedResult stays typed end-to-end. */
export type InventoryListRow = {
  id: string;
  tenantId: string;
  branchId: string;
  serialNumberId: string;
  statusCodeId: string;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string; sapCode: string };
  statusCode: { id: string; code: string; name: string; color: string | null };
  serialNumber: {
    id: string;
    serialNo: string;
    model: {
      id: string;
      skuCode: string;
      name: string;
      srp: unknown;
      brand: { name: string } | null;
    };
  };
};
