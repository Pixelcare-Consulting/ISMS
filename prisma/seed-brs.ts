import type { PrismaClient } from "@prisma/client";

import { LEGACY_INVENTORY_STATUS_TO_CODE } from "@/features/reason-status/constants/defaults";
import { getReasonStatusCodeId } from "./seed-reason-status";

export async function seedBrsDemoData(

  prisma: PrismaClient,

  tenantId: string,

  userIdsByEmail: Record<string, { id: string }>,

) {

  const area = await prisma.area.upsert({

    where: { tenantId_code: { tenantId, code: "NCR" } },

    create: { tenantId, code: "NCR", name: "National Capital Region" },

    update: {},

  });



  const brand = await prisma.brand.upsert({

    where: { tenantId_name: { tenantId, name: "Western" } },

    create: { tenantId, name: "Western", code: "WEST" },

    update: {},

  });



  const category = await prisma.category.upsert({

    where: { tenantId_name: { tenantId, name: "Refrigerator" } },

    create: { tenantId, name: "Refrigerator", brandId: brand.id },

    update: {},

  });



  const models = [

    {

      skuCode: "WREF-200L",

      name: "Western 200L Refrigerator",

      status: "active" as const,

      maxQty: 5,

      milDays: 30,

    },

    {

      skuCode: "WREF-300L",

      name: "Western 300L Refrigerator",

      status: "active" as const,

      maxQty: 3,

      milDays: 45,

    },

    {

      skuCode: "WREF-LEGACY",

      name: "Western Legacy Model (retired)",

      status: "retired" as const,

      maxQty: 2,

      milDays: 60,

    },

  ];



  const modelRecords: {

    id: string;

    skuCode: string;

    status: string;

    maxQty: number;

    milDays: number;

  }[] = [];



  for (const m of models) {

    const model = await prisma.productModel.upsert({

      where: { tenantId_skuCode: { tenantId, skuCode: m.skuCode } },

      create: {

        tenantId,

        brandId: brand.id,

        categoryId: category.id,

        skuCode: m.skuCode,

        name: m.name,

        status: m.status,

      },

      update: { name: m.name, status: m.status },

    });

    modelRecords.push({

      id: model.id,

      skuCode: m.skuCode,

      status: m.status,

      maxQty: m.maxQty,

      milDays: m.milDays,

    });

  }



  const mainWarehouse = await prisma.warehouse.upsert({

    where: { tenantId_code: { tenantId, code: "PASIG-MAIN" } },

    create: { tenantId, code: "PASIG-MAIN", name: "Pasig Main Warehouse", isMain: true },

    update: {},

  });



  await prisma.warehouseLocation.upsert({

    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: "A1" } },

    create: { warehouseId: mainWarehouse.id, code: "A1", name: "Aisle 1" },

    update: {},

  });



  const branches = [

    { sapCode: "WMK-001", name: "Western Makati", schedule: { days: ["Tue", "Thu"] } },

    { sapCode: "WRC-002", name: "Western Recto", schedule: { days: ["Mon", "Wed", "Fri"] } },

    { sapCode: "WQC-003", name: "Western Quezon City", schedule: { days: ["Tue", "Fri"] } },

  ] as const;



  const branchRecords: { id: string; sapCode: string; name: string }[] = [];

  const activeModels = modelRecords.filter((m) => m.status === "active");



  for (const b of branches) {

    const branch = await prisma.branch.upsert({

      where: { tenantId_sapCode: { tenantId, sapCode: b.sapCode } },

      create: {

        tenantId,

        sapCode: b.sapCode,

        name: b.name,

        branchAreaId: area.id,

        deliverySchedule: b.schedule,

        status: "active",

      },

      update: { name: b.name, deliverySchedule: b.schedule },

    });

    branchRecords.push(branch);



    await prisma.alternateWarehouse.upsert({

      where: { branchId_warehouseId: { branchId: branch.id, warehouseId: mainWarehouse.id } },

      create: { branchId: branch.id, warehouseId: mainWarehouse.id },

      update: {},

    });



    for (const model of activeModels) {

      const maxQty = b.sapCode === "WMK-001" ? model.maxQty : model.maxQty - 1;



      await prisma.branchPlanogram.upsert({

        where: { branchId_modelId: { branchId: branch.id, modelId: model.id } },

        create: { tenantId, branchId: branch.id, modelId: model.id, maxQty },

        update: { maxQty },

      });



      await prisma.branchMilSetting.upsert({

        where: { branchId_modelId: { branchId: branch.id, modelId: model.id } },

        create: {

          tenantId,

          branchId: branch.id,

          modelId: model.id,

          daysThreshold: model.milDays,

        },

        update: { daysThreshold: model.milDays },

      });

    }

  }



  const makati = branchRecords.find((b) => b.sapCode === "WMK-001");

  const psUserId = userIdsByEmail["ps@demo.local"]?.id;
  const tlUserId = userIdsByEmail["tl@demo.local"]?.id;
  const spUserId = userIdsByEmail["sp@demo.local"]?.id;



  if (makati && psUserId) {

    const psAor = await prisma.aor.findFirst({

      where: { tenantId, userId: psUserId, branchId: makati.id },

    });

    if (!psAor) {

      await prisma.aor.create({

        data: { tenantId, userId: psUserId, branchId: makati.id },

      });

    }

  }



  if (spUserId && makati) {

    const spAor = await prisma.aor.findFirst({

      where: { tenantId, userId: spUserId, branchId: makati.id },

    });

    if (!spAor) {

      await prisma.aor.create({

        data: { tenantId, userId: spUserId, branchId: makati.id },

      });

    }

  }



  if (tlUserId) {

    for (const branch of branchRecords) {

      const existing = await prisma.aor.findFirst({

        where: { tenantId, userId: tlUserId, branchId: branch.id },

      });

      if (!existing) {

        await prisma.aor.create({

          data: { tenantId, userId: tlUserId, branchId: branch.id },

        });

      }

    }

  }



  if (makati) {

    const primaryModel = activeModels[0];

    const serials = [

      { serialNo: "SN-WMK-001", status: "Stock" as const, ageDays: 45 },

      { serialNo: "SN-WMK-002", status: "DeliveryInTransit" as const, ageDays: 0 },

      { serialNo: "SN-WMK-003", status: "Stock" as const, ageDays: 5 },

    ];



    for (const item of serials) {
      const code = LEGACY_INVENTORY_STATUS_TO_CODE[item.status] ?? "STK";
      const statusCodeId = await getReasonStatusCodeId(
        prisma,
        tenantId,
        "inventory_system",
        code,
      );

      const sn = await prisma.serialNumber.upsert({

        where: { tenantId_serialNo: { tenantId, serialNo: item.serialNo } },

        create: { tenantId, modelId: primaryModel.id, serialNo: item.serialNo },

        update: {},

      });



      const stockedAt = new Date(Date.now() - item.ageDays * 24 * 60 * 60 * 1000);



      await prisma.branchInventory.upsert({

        where: { branchId_serialNumberId: { branchId: makati.id, serialNumberId: sn.id } },

        create: {
          tenantId,
          branchId: makati.id,
          serialNumberId: sn.id,
          statusCodeId,
          updatedAt: stockedAt,
        },
        update: { statusCodeId, updatedAt: stockedAt },

      });

    }

  }



  await prisma.tenant.update({

    where: { id: tenantId },

    data: { name: "Western Appliance Trade Group", tagline: "BRS inventory ops demo" },

  });

}

