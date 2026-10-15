import type {
  StockCountSessionStatus,
  StockVarianceStatus,
} from "@prisma/client";

/** Plain props for the stock-count detail client panel (RSC-safe). */
export type StockCountSessionDetailDto = {
  id: string;
  sessionNo: string;
  status: StockCountSessionStatus;
  branch: { name: string; sapCode: string };
  lines: {
    id: string;
    status: string;
    expectedInCount: boolean;
    serialNumber: { serialNo: string };
    model: { skuCode: string; name: string; brand: { name: string } | null };
    countedBy: { name: string | null; email: string } | null;
  }[];
  variances: {
    id: string;
    varianceType: string;
    status: StockVarianceStatus;
    description: string | null;
    investigationNotes: string | null;
    sapDocRef: string | null;
    line: {
      id: string;
      serialNumber: { serialNo: string };
      model: { skuCode: string; name: string };
    } | null;
  }[];
};

type SessionDetailSource = {
  id: string;
  sessionNo: string;
  status: StockCountSessionStatus;
  branch: { name: string; sapCode: string };
  lines: {
    id: string;
    status: string;
    expectedInCount: boolean;
    serialNumber: { serialNo: string };
    model: {
      skuCode: string;
      name: string;
      brand: { name: string } | null;
    };
    countedBy: { name: string | null; email: string } | null;
  }[];
  variances: {
    id: string;
    varianceType: string;
    status: StockVarianceStatus;
    description: string | null;
    investigationNotes: string | null;
    sapDocRef: string | null;
    line: {
      id: string;
      serialNumber: { serialNo: string };
      model: { skuCode: string; name: string };
    } | null;
  }[];
};

/** True when an in-progress count has no expected STK lines yet (safe to backfill). */
export function shouldRefreshExpectedLines(session: {
  status: string;
  lines: { expectedInCount: boolean }[];
}): boolean {
  if (session.status !== "in_progress") return false;
  return !session.lines.some((line) => line.expectedInCount);
}

export function toStockCountSessionDetailDto(
  session: SessionDetailSource,
): StockCountSessionDetailDto {
  return {
    id: session.id,
    sessionNo: session.sessionNo,
    status: session.status,
    branch: {
      name: session.branch.name,
      sapCode: session.branch.sapCode,
    },
    lines: session.lines.map((line) => ({
      id: line.id,
      status: line.status,
      expectedInCount: line.expectedInCount,
      serialNumber: { serialNo: line.serialNumber.serialNo },
      model: {
        skuCode: line.model.skuCode,
        name: line.model.name,
        brand: line.model.brand ? { name: line.model.brand.name } : null,
      },
      countedBy: line.countedBy
        ? { name: line.countedBy.name, email: line.countedBy.email }
        : null,
    })),
    variances: session.variances.map((variance) => ({
      id: variance.id,
      varianceType: variance.varianceType,
      status: variance.status,
      description: variance.description,
      investigationNotes: variance.investigationNotes,
      sapDocRef: variance.sapDocRef,
      line: variance.line
        ? {
            id: variance.line.id,
            serialNumber: {
              serialNo: variance.line.serialNumber.serialNo,
            },
            model: {
              skuCode: variance.line.model.skuCode,
              name: variance.line.model.name,
            },
          }
        : null,
    })),
  };
}
