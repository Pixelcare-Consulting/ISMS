import { auditService } from "@/features/audit/services/audit.service";
import {
  officialSalesRepository,
  type OfficialSalesRowCreateInput,
} from "@/features/official-sales/repositories/official-sales.repository";
import { buildOfficialSalesTemplateWorkbook } from "@/features/official-sales/services/official-sales.workbook";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";
import * as XLSX from "xlsx";

/** Strip punctuation/spaces so "SI/TRANS NO." and "DR NO." match aliases. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickColumn(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const want = normalizeHeader(alias);
    const hit = entries.find(([key]) => normalizeHeader(key) === want);
    if (hit) {
      const value = hit[1];
      if (value != null && value !== "") return value;
    }
  }
  return undefined;
}

function pickOptionalText(
  row: Record<string, unknown>,
  aliases: string[],
): string | null {
  const raw = pickColumn(row, aliases);
  if (raw == null || raw === "") return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
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

function parseSaleAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizeAction(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim().toUpperCase();
  if (!text) return null;
  // Light validation: known Accounting actions preferred; other text kept for display.
  if (["ADD", "UPD", "DEL", "UPDATE", "DELETE"].includes(text)) {
    return text === "UPDATE" ? "UPD" : text === "DELETE" ? "DEL" : text;
  }
  return text.slice(0, 32);
}

function parseUploadBuffer(buffer: ArrayBuffer | Buffer): OfficialSalesRowCreateInput[] {
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
        pickColumn(row, ["serial number", "serialnumber", "serial", "serialno", "sn"]) ?? "",
      ).trim();

      // Prefer SI/TRANS NO. over DR NO. / Trans # (empty preferred falls through).
      const drNoRaw = pickColumn(row, [
        "si/trans no.",
        "si/trans no",
        "sitransno",
        "si trans no",
        "trans #",
        "trans#",
        "transno",
        "transactionno",
        "dr no.",
        "dr no",
        "drno",
        "dr number",
        "dr#",
        "deliveryno",
        "delivery no",
      ]);

      // Prefer DATE over DR DATE / Trans Date (empty preferred falls through).
      const drDate = parseDrDate(
        pickColumn(row, [
          "date",
          "trans date",
          "transdate",
          "dr date",
          "drdate",
          "deliverydate",
        ]),
      );

      const branchSold = pickOptionalText(row, [
        "branch name",
        "branchname",
        "branch sold",
        "branchsold",
        "branch",
      ]);
      const action = normalizeAction(
        pickColumn(row, ["action key", "actionkey", "action"]),
      );

      return {
        serial,
        drDate,
        drNo: drNoRaw == null || drNoRaw === "" ? null : String(drNoRaw).trim(),
        branchSold,
        action,
        dealer: pickOptionalText(row, ["dealer"]),
        brand: pickOptionalText(row, ["brand"]),
        itemModel: pickOptionalText(row, ["item/model", "itemmodel", "item model", "model"]),
        saleAmount: parseSaleAmount(pickColumn(row, ["sale amount", "saleamount", "amount"])),
        packageName: pickOptionalText(row, ["package", "packagename", "package name"]),
      };
    })
    .filter((row) => row.serial.length > 0);

  if (parsed.length === 0) {
    throw new Error(
      "No rows found. Expected columns: DEALER–ACTION KEY (or legacy Trans Date / Serial Number / Action)",
    );
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

  /**
   * Hard-delete staging rows that have not mutated inventory (pending/error only).
   * Rejects any request that includes a success row.
   */
  async deleteRows(tenantId: string, userId: string, rowIds: string[]) {
    const uniqueIds = [...new Set(rowIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error("Select at least one row to delete");
    }

    const total = await officialSalesRepository.countRowsByIds(tenantId, uniqueIds);
    if (total !== uniqueIds.length) {
      throw new Error("One or more rows were not found");
    }

    const deletable = await officialSalesRepository.findDeletableRows(
      tenantId,
      uniqueIds,
    );
    if (deletable.length !== uniqueIds.length) {
      throw new Error(
        "Only pending or error rows can be deleted. Successfully processed rows cannot be removed here.",
      );
    }

    const result = await officialSalesRepository.deleteDeletableRows(
      tenantId,
      uniqueIds,
    );

    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.row_deleted",
      entityType: "OfficialSalesImportRow",
      entityId: tenantId,
      metadata: {
        deleted: result.count,
        rowIds: uniqueIds,
        serials: deletable.map((r) => r.serial),
      },
    });

    return result.count;
  },

  /** ExcelJS dealer template (DEALER–ACTION KEY with header colors). */
  async buildTemplate(): Promise<Buffer> {
    return buildOfficialSalesTemplateWorkbook();
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
          const openSale = await officialSalesRepository.findOpenSaleDetailBySerial(
            tenantId,
            row.serial,
          );
          if (openSale) {
            await officialSalesRepository.updateRowResult(row.id, {
              status: "error",
              result: `Serial already has an open sale (${openSale.sale.transactionNo})`,
            });
            error += 1;
            continue;
          }

          const transactionNo = `OFS-${Date.now().toString(36).toUpperCase()}-${row.id.slice(-4)}`;
          const noteParts = [
            "Official sales import",
            row.drNo ? `Trans # ${row.drNo}` : null,
            row.drDate ? `Trans Date ${row.drDate.toISOString().slice(0, 10)}` : null,
            row.branchSold ? `Branch Sold ${row.branchSold}` : null,
            row.action ? `Action ${row.action}` : null,
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
                statusCodeId: sldCodeId,
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
          // Stay Sold: restore inventory to STK only — do not flip sale-line status.
          // Action is stored for display; process still uses inventory status flips.
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
