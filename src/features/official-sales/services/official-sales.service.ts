import { auditService } from "@/features/audit/services/audit.service";
import { officialSalesRepository } from "@/features/official-sales/repositories/official-sales.repository";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";
import * as XLSX from "xlsx";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function pickColumn(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const want = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key) === want);
    if (hit) return hit[1];
  }
  return undefined;
}

function parseDrDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
}

function parseUploadBuffer(buffer: ArrayBuffer | Buffer): {
  serial: string;
  drDate: Date | null;
  drNo: string | null;
}[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Workbook sheet is empty");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  const parsed = rows
    .map((row) => {
      const serial = String(
        pickColumn(row, ["serial", "serialno", "serialnumber", "sn"]) ?? "",
      ).trim();
      const drNoRaw = pickColumn(row, ["drno", "dr number", "dr#", "deliveryno"]);
      const drDate = parseDrDate(
        pickColumn(row, ["drdate", "dr date", "deliverydate", "date"]),
      );
      return {
        serial,
        drDate,
        drNo: drNoRaw == null || drNoRaw === "" ? null : String(drNoRaw).trim(),
      };
    })
    .filter((row) => row.serial.length > 0);

  if (parsed.length === 0) {
    throw new Error("No rows found. Expected columns: Serial, DR DATE, DR NO");
  }
  return parsed;
}

export const officialSalesService = {
  listStaging(tenantId: string) {
    return officialSalesRepository.listStagingRows(tenantId);
  },

  async upload(
    tenantId: string,
    userId: string,
    file: { name: string; buffer: Buffer },
  ) {
    const rows = parseUploadBuffer(file.buffer);
    const batch = await officialSalesRepository.createBatchWithRows(
      tenantId,
      userId,
      file.name,
      rows,
    );
    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.uploaded",
      entityType: "OfficialSalesImportBatch",
      entityId: batch.id,
      metadata: { fileName: file.name, rowCount: rows.length },
    });
    return { batchId: batch.id, rowCount: rows.length };
  },

  async clearTemp(tenantId: string, userId: string) {
    const result = await officialSalesRepository.clearTemp(tenantId, true);
    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.cleared",
      entityType: "OfficialSalesImportRow",
      entityId: tenantId,
      metadata: { deleted: result.count },
    });
    return result.count;
  },

  async processRows(tenantId: string, userId: string, rowIds?: string[]) {
    const rows = await officialSalesRepository.findPendingRows(tenantId, rowIds);
    if (rows.length === 0) return { processed: 0, successCount: 0, errorCount: 0 };

    const stkCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "inventory_system",
      "STK",
    );
    const sldCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "inventory_system",
      "SLD",
    );
    const rsvCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "inventory_system",
      "RSV",
    );

    let success = 0;
    let error = 0;

    for (const row of rows) {
      try {
        const inventory = await officialSalesRepository.findInventoryBySerial(
          tenantId,
          row.serial,
        );
        if (!inventory) {
          await officialSalesRepository.updateRowResult(row.id, {
            status: "error",
            result: "Serial not found in branch inventory",
          });
          error += 1;
          continue;
        }

        const statusCode = inventory.statusCode.code.toUpperCase();
        if (statusCode === "STK") {
          const transactionNo = `OFS-${Date.now().toString(36).toUpperCase()}-${row.id.slice(-4)}`;
          const noteParts = [
            "Official sales import",
            row.drNo ? `DR NO ${row.drNo}` : null,
            row.drDate ? `DR DATE ${row.drDate.toISOString().slice(0, 10)}` : null,
          ].filter(Boolean);

          await prisma.$transaction(async (tx) => {
            const created = await tx.branchSalesTransaction.create({
              data: {
                tenantId,
                branchId: inventory.branchId,
                alternateBranchId: inventory.branchId,
                transactionNo,
                transactionDate: row.drDate,
                deliveryNo: row.drNo,
                deliveryDate: row.drDate,
                amount: 0,
                notes: noteParts.join(" · "),
                atrStatus: "open",
                createdById: userId,
              },
            });
            await tx.branchSalesTransactionDetail.create({
              data: {
                salesId: created.id,
                modelId: inventory.serialNumber.model?.id ?? null,
                serialNumberId: inventory.serialNumberId,
                saleAmount: 0,
                amount: 0,
              },
            });
            const updated = await tx.branchInventory.updateMany({
              where: {
                id: inventory.id,
                statusCodeId: stkCodeId,
              },
              data: {
                statusCodeId: sldCodeId,
                updatedById: userId,
              },
            });
            if (updated.count === 0) {
              throw new Error("Inventory status changed; expected STK");
            }
          });

          await officialSalesRepository.updateRowResult(row.id, {
            status: "success",
            result: "SALE — marked sold (SLD)",
          });
          success += 1;
          continue;
        }

        if (statusCode === "SLD" || statusCode === "RSV") {
          const fromCodeId = statusCode === "RSV" ? rsvCodeId : sldCodeId;
          await prisma.$transaction(async (tx) => {
            const updated = await tx.branchInventory.updateMany({
              where: {
                id: inventory.id,
                statusCodeId: fromCodeId,
              },
              data: {
                statusCodeId: stkCodeId,
                updatedById: userId,
              },
            });
            if (updated.count === 0) {
              throw new Error(`Inventory status changed; expected ${statusCode}`);
            }
          });

          await officialSalesRepository.updateRowResult(row.id, {
            status: "success",
            result: `RETURN — restored to STK from ${statusCode}`,
          });
          success += 1;
          continue;
        }

        await officialSalesRepository.updateRowResult(row.id, {
          status: "error",
          result: `Unsupported inventory status ${statusCode}`,
        });
        error += 1;
      } catch (e) {
        await officialSalesRepository.updateRowResult(row.id, {
          status: "error",
          result: e instanceof Error ? e.message : "Processing failed",
        });
        error += 1;
      }
    }

    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.processed",
      entityType: "OfficialSalesImportRow",
      entityId: tenantId,
      metadata: { processed: rows.length, success, error },
    });

    return { processed: rows.length, successCount: success, errorCount: error };
  },
};
