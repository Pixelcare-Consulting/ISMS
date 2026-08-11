import { renderToBuffer } from "@react-pdf/renderer";

import {
  AtrOdrfPdfDocument,
  type AtrOdrfPdfData,
} from "@/features/sales/components/atr-odrf-pdf-document";
import { buildAtrOdrfPdfPath } from "@/features/sales/constants/process-return";
import { getObjectStorage } from "@/lib/storage";

export async function generateAndStoreAtrOdrfPdf(input: {
  tenantId: string;
  returnRequestId: string;
  data: AtrOdrfPdfData;
}): Promise<string> {
  const buffer = await renderToBuffer(<AtrOdrfPdfDocument {...input.data} />);
  const path = buildAtrOdrfPdfPath({
    tenantId: input.tenantId,
    returnRequestId: input.returnRequestId,
  });
  const storage = getObjectStorage();
  await storage.upload({
    path,
    body: Buffer.from(buffer),
    contentType: "application/pdf",
  });
  return path;
}
