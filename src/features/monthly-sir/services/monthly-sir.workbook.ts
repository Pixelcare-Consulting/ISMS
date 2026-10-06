import ExcelJS from "exceljs";

import {
  MONTHLY_SIR_PCOUNT_FILL,
  MONTHLY_SIR_SYSTEM_FILL,
  MONTHLY_SIR_VARIANCE_LABELS,
} from "@/features/monthly-sir/constants/monthly-sir";
import { prisma } from "@/lib/database/client";

const HEADERS = [
  "BRANCH",
  "DR_DATE",
  "DR_NO",
  "BRAND",
  "ITEM/MODEL",
  "SERIAL NUMBER",
  "AGING",
  "REMARKS",
  "ACCTG REMARKS",
  "system",
  "LAST UPDATE DATE",
  "LAST UPDATE BY",
  "pCOUNT",
  "UPLOAD DATE",
  "UPLOADED BY",
  "PENDING",
  "UPLOAD DATE",
] as const;

function valueToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) return valueToString(value.result);
  }
  return "";
}

function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function styleDataSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.autoFilter = { from: "A5", to: "Q5" };
  sheet.getRow(5).font = { bold: true };
  for (let column = 10; column <= 12; column += 1) {
    sheet.getCell(5, column).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: MONTHLY_SIR_SYSTEM_FILL },
    };
  }
  for (let column = 13; column <= 15; column += 1) {
    sheet.getCell(5, column).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: MONTHLY_SIR_PCOUNT_FILL },
    };
  }
  [
    18, 12, 16, 16, 24, 22, 10, 22, 22, 12, 18, 20, 12, 18, 20, 12, 18,
  ].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

async function latestDeliveries(tenantId: string, serialNumberIds: string[]) {
  const rows = await prisma.branchDeliveryLine.findMany({
    where: {
      serialNumberId: { in: serialNumberIds },
      delivery: { tenantId, acceptedAt: { not: null } },
    },
    select: {
      serialNumberId: true,
      delivery: {
        select: { deliveryNo: true, acceptedAt: true, createdAt: true },
      },
    },
    orderBy: { delivery: { acceptedAt: "desc" } },
  });
  const result = new Map<
    string,
    { deliveryNo: string; deliveryDate: Date | null }
  >();
  for (const row of rows) {
    if (!result.has(row.serialNumberId)) {
      result.set(row.serialNumberId, {
        deliveryNo: row.delivery.deliveryNo,
        deliveryDate: row.delivery.acceptedAt ?? row.delivery.createdAt,
      });
    }
  }
  return result;
}

export async function buildMonthlySirTemplate(input: {
  tenantId: string;
  sessionId: string;
  generatedBy: string;
  uploadedAt?: Date | null;
  uploadedBy?: string | null;
  scannedSerialNos?: string[];
}): Promise<{ buffer: Buffer; filename: string }> {
  const session = await prisma.stockCountSession.findFirst({
    where: { id: input.sessionId, tenantId: input.tenantId },
    include: {
      branch: { select: { name: true, sapCode: true } },
      lines: {
        orderBy: { serialNumber: { serialNo: "asc" } },
        include: {
          serialNumber: { select: { id: true, serialNo: true } },
          model: { select: { name: true, skuCode: true, brand: { select: { name: true } } } },
          branchInventory: {
            select: {
              createdAt: true,
              updatedAt: true,
              updatedBy: { select: { name: true, email: true } },
              statusCode: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  if (!session) throw new Error("Linked count session not found");

  const scannedSerialNos = [...new Set(
    (input.scannedSerialNos ?? [])
      .map((serialNo) => serialNo.trim())
      .filter(Boolean)
      .map((serialNo) => serialNo.toUpperCase()),
  )];
  const scannedSerials = scannedSerialNos.length
    ? await prisma.serialNumber.findMany({
        where: {
          tenantId: input.tenantId,
          deletedAt: null,
          OR: scannedSerialNos.map((serialNo) => ({
            serialNo: { equals: serialNo, mode: "insensitive" as const },
          })),
        },
        include: {
          model: {
            select: {
              name: true,
              skuCode: true,
              brand: { select: { name: true } },
            },
          },
          branchInventories: {
            where: { branchId: session.branchId },
            select: {
              createdAt: true,
              updatedAt: true,
              updatedBy: { select: { name: true, email: true } },
              statusCode: { select: { code: true } },
            },
            take: 1,
          },
        },
      })
    : [];
  const catalogBySerial = new Map(
    scannedSerials.map((serial) => [serial.serialNo.toUpperCase(), serial]),
  );
  const invalidSerials = scannedSerialNos.filter(
    (serialNo) => !catalogBySerial.has(serialNo),
  );
  if (invalidSerials.length > 0) {
    throw new Error(`Unknown serials: ${invalidSerials.join(", ")}`);
  }

  const sessionSerials = new Set(
    session.lines.map((line) => line.serialNumber.serialNo.toUpperCase()),
  );
  const surplusSerials = scannedSerials.filter(
    (serial) => !sessionSerials.has(serial.serialNo.toUpperCase()),
  );
  const deliveries = await latestDeliveries(
    input.tenantId,
    [
      ...session.lines.map((line) => line.serialNumber.id),
      ...surplusSerials.map((serial) => serial.id),
    ],
  );
  const now = new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = now;
  const period = now.toISOString().slice(0, 7);
  const rawSheetName = `${now.toISOString().slice(0, 10).replaceAll("-", "")}-pcount-${session.branch.sapCode}-all_${period}`;
  const sheet = workbook.addWorksheet(rawSheetName.slice(0, 31));
  sheet.addRow([`PCOUNT ${session.branch.name}`]);
  sheet.addRow([`DATETIME GENERATED ${now.toISOString()}`]);
  sheet.addRow([`GENERATED BY ${input.generatedBy}`]);
  sheet.addRow([]);
  sheet.addRow([...HEADERS]);

  for (const line of session.lines) {
    const delivery = deliveries.get(line.serialNumber.id);
    const ageAnchor = delivery?.deliveryDate ?? line.branchInventory?.createdAt ?? now;
    const aging = Math.max(
      0,
      Math.floor((now.getTime() - ageAnchor.getTime()) / 86_400_000),
    );
    sheet.addRow([
      session.branch.name,
      formatDate(delivery?.deliveryDate),
      delivery?.deliveryNo ?? "",
      line.model.brand?.name ?? "",
      line.model.name || line.model.skuCode,
      line.serialNumber.serialNo,
      aging,
      line.notes ?? "",
      "",
      line.branchInventory?.statusCode.code ?? "",
      formatDate(line.branchInventory?.updatedAt),
      line.branchInventory?.updatedBy?.name ??
        line.branchInventory?.updatedBy?.email ??
        "",
      scannedSerialNos.includes(line.serialNumber.serialNo.toUpperCase())
        ? line.branchInventory?.statusCode.code ?? "STK"
        : "",
      formatDate(input.uploadedAt),
      input.uploadedBy ?? "",
      "",
      formatDate(input.uploadedAt),
    ]);
  }
  for (const serial of surplusSerials) {
    const inventory = serial.branchInventories[0];
    const delivery = deliveries.get(serial.id);
    const ageAnchor = delivery?.deliveryDate ?? inventory?.createdAt ?? now;
    const aging = Math.max(
      0,
      Math.floor((now.getTime() - ageAnchor.getTime()) / 86_400_000),
    );
    sheet.addRow([
      session.branch.name,
      formatDate(delivery?.deliveryDate),
      delivery?.deliveryNo ?? "",
      serial.model.brand?.name ?? "",
      serial.model.name || serial.model.skuCode,
      serial.serialNo,
      aging,
      "Scanned outside the session snapshot",
      "",
      inventory?.statusCode.code ?? "",
      formatDate(inventory?.updatedAt),
      inventory?.updatedBy?.name ?? inventory?.updatedBy?.email ?? "",
      "STK",
      "",
      "",
      "",
      "",
    ]);
  }
  styleDataSheet(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    filename: input.scannedSerialNos
      ? `pcount-${session.branch.sapCode}-${period}-pcount-from-scans.xlsx`
      : `pcount-${session.branch.sapCode}-${period}.xlsx`,
  };
}

export interface MonthlySirUploadRow {
  rowNumber: number;
  serialNo: string;
  pcount: string;
}

export async function parseMonthlySirUpload(
  buffer: Buffer,
): Promise<MonthlySirUploadRow[]> {
  if (buffer.length < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Upload an Excel .xlsx file downloaded from Monthly SIR");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheet");

  const headerRow = sheet.getRow(5);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, column) => {
    headerMap.set(valueToString(cell.value).toUpperCase(), column);
  });
  const serialColumn = headerMap.get("SERIAL NUMBER");
  const pcountColumn = headerMap.get("PCOUNT");
  if (!serialColumn || !pcountColumn) {
    throw new Error("The template must contain SERIAL NUMBER and pCOUNT columns");
  }

  const rows: MonthlySirUploadRow[] = [];
  const seen = new Set<string>();
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 5) return;
    const serialNo = valueToString(row.getCell(serialColumn).value);
    const pcount = valueToString(row.getCell(pcountColumn).value).toUpperCase();
    if (!serialNo && !pcount) return;
    if (!serialNo || !pcount) {
      throw new Error(`Row ${rowNumber}: SERIAL NUMBER and pCOUNT are required`);
    }
    const key = serialNo.toUpperCase();
    if (seen.has(key)) throw new Error(`Row ${rowNumber}: duplicate serial ${serialNo}`);
    seen.add(key);
    rows.push({ rowNumber, serialNo, pcount });
  });
  if (rows.length === 0) throw new Error("No completed pCOUNT rows were found");
  return rows;
}

export async function buildMonthlySirVarianceWorkbook(input: {
  tenantId: string;
  sessionId: string;
  generatedBy: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const session = await prisma.stockCountSession.findFirst({
    where: { id: input.sessionId, tenantId: input.tenantId },
    include: {
      branch: { select: { name: true, sapCode: true } },
      variances: {
        orderBy: { createdAt: "asc" },
        include: {
          line: {
            include: {
              serialNumber: { select: { serialNo: true } },
              model: { select: { name: true, skuCode: true } },
              branchInventory: { select: { createdAt: true } },
            },
          },
        },
      },
    },
  });
  if (!session) throw new Error("Linked count session not found");
  if (session.status === "draft" || session.status === "in_progress") {
    throw new Error("Upload and complete the pCOUNT before generating variances");
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("PCOUNT Variance");
  sheet.addRow([`PCOUNT VARIANCE ${session.branch.name}`]);
  sheet.addRow([`DATETIME GENERATED ${new Date().toISOString()}`]);
  sheet.addRow([`GENERATED BY ${input.generatedBy}`]);
  sheet.addRow([]);
  sheet.addRow([
    "BRANCH",
    "SERIAL",
    "MODEL",
    "AGING",
    "STATUS",
    "IS VARIANCE",
    "DR UPLOAD DATE",
    "REMARKS",
  ]);
  sheet.getRow(5).font = { bold: true };
  for (const variance of session.variances) {
    const line = variance.line;
    if (!line) continue;
    const anchor = line.branchInventory?.createdAt;
    const aging = anchor
      ? Math.max(0, Math.floor((Date.now() - anchor.getTime()) / 86_400_000))
      : "";
    const label =
      MONTHLY_SIR_VARIANCE_LABELS[
        variance.varianceType as keyof typeof MONTHLY_SIR_VARIANCE_LABELS
      ] ?? variance.varianceType;
    sheet.addRow([
      session.branch.name,
      line.serialNumber.serialNo,
      line.model.name || line.model.skuCode,
      aging,
      "VAR",
      label,
      formatDate(anchor),
      variance.investigationNotes ?? variance.description ?? line.notes ?? "",
    ]);
  }
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  [20, 22, 25, 10, 10, 24, 18, 40].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    filename: `pcount-variance-${session.branch.sapCode}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}
