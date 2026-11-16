import { renderToBuffer } from "@react-pdf/renderer";

import {
  AtrOdrfPdfDocument,
  type AtrOdrfPdfData,
} from "@/features/sales/components/atr-odrf-pdf-document";
import { buildAtrOdrfPdfPath } from "@/features/sales/constants/process-return";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { logger } from "@/lib/shared/logger";
import { getObjectStorage } from "@/lib/storage";
import type { PrintLetterhead } from "@/utils/print-document";

/** Same rule as the slips: the document still generates, without the header, if it cannot load. */
async function loadLetterhead(tenantId: string): Promise<PrintLetterhead | null> {
  try {
    return await tenantService.getPrintLetterhead(tenantId);
  } catch (error) {
    logger.error({ err: error, tenantId }, "Could not load the ATR/ODRF letterhead");
    return null;
  }
}

export async function generateAndStoreAtrOdrfPdf(input: {
  tenantId: string;
  returnRequestId: string;
  data: AtrOdrfPdfData;
}): Promise<string> {
  const letterhead = await loadLetterhead(input.tenantId);
  const buffer = await renderToBuffer(
    <AtrOdrfPdfDocument {...input.data} letterhead={letterhead} />,
  );
  const path = buildAtrOdrfPdfPath({
    tenantId: input.tenantId,
    returnRequestId: input.returnRequestId,
  });
  const storage = await getObjectStorage();
  await storage.upload({
    path,
    body: Buffer.from(buffer),
    contentType: "application/pdf",
  });
  return path;
}
