import { z } from "zod";

import { isServiceDocumentTypeName } from "@/features/sales/constants/process-return";
import { prisma } from "@/lib/database/client";

/** What the Process Return dialog sends, for branch and service center sales alike. */
export const processReturnPayloadSchema = z.object({
  saleDetailId: z.string().min(1),
  documentTypeId: z.string().min(1),
  stockStatusCode: z.enum(["STK", "DEF"]),
  actionType: z.enum(["return", "replacement"]),
  problemDescriptionIds: z.array(z.string().min(1)).min(1),
  serviceCenterId: z.string().optional().nullable(),
  classification: z.string().trim().optional().nullable(),
  serviceModelId: z.string().optional().nullable(),
  customerDealerBranch: z.string().trim().optional().nullable(),
  natureOfTransaction: z.string().trim().optional().nullable(),
  refContactPo: z.string().trim().optional().nullable(),
  warehouseLocationId: z.string().optional().nullable(),
});

export type ProcessReturnPayload = z.infer<typeof processReturnPayloadSchema>;

export interface ProcessReturnLookupOption {
  id: string;
  name: string;
}

export interface ProcessReturnLookups {
  documentTypes: ProcessReturnLookupOption[];
  problemDescriptions: ProcessReturnLookupOption[];
  serviceCenters: ProcessReturnLookupOption[];
  models: ProcessReturnLookupOption[];
  warehouseLocations: ProcessReturnLookupOption[];
}

/**
 * Lookups for the Process Return dialog. `serviceOnly` (service center sales) keeps only the
 * Service Return / Service Replacement document types and leaves out the service center list,
 * since the selling service center finishes the request.
 */
export async function loadProcessReturnLookups(
  tenantId: string,
  options: { serviceOnly?: boolean } = {},
): Promise<ProcessReturnLookups> {
  const [documentTypes, problemDescriptions, serviceCenters, models, warehouseLocations] =
    await Promise.all([
      prisma.documentType.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.problemDescription.findMany({
        where: { tenantId, recordStatus: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      options.serviceOnly
        ? Promise.resolve([])
        : prisma.serviceCenter.findMany({
            where: { tenantId, deletedAt: null, status: "active" },
            select: { id: true, name: true, sapCode: true },
            orderBy: { name: "asc" },
          }),
      prisma.productModel.findMany({
        where: { tenantId, status: "active" },
        select: { id: true, skuCode: true, name: true },
        orderBy: { skuCode: "asc" },
        take: 1000,
      }),
      prisma.warehouseLocation.findMany({
        where: { warehouse: { tenantId } },
        select: {
          id: true,
          code: true,
          name: true,
          warehouse: { select: { name: true, code: true } },
        },
        orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
        take: 1000,
      }),
    ]);

  return {
    documentTypes: options.serviceOnly
      ? documentTypes.filter((type) => isServiceDocumentTypeName(type.name))
      : documentTypes,
    problemDescriptions,
    serviceCenters: serviceCenters.map((sc) => ({
      id: sc.id,
      name: sc.sapCode ? `${sc.sapCode} · ${sc.name}` : sc.name,
    })),
    models: models.map((m) => ({
      id: m.id,
      name: m.skuCode ? `${m.skuCode} · ${m.name}` : m.name,
    })),
    warehouseLocations: warehouseLocations.map((loc) => ({
      id: loc.id,
      name: [loc.warehouse.code || loc.warehouse.name, loc.code || loc.name]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}
