import { NextResponse } from "next/server";

import {
  SC_RETURNS_PROCESS,
  SC_SALES_ACCESS,
  SC_SERVICE_RETURN_REQUEST_PERMISSIONS,
} from "@/features/service-center-ops/constants/sc-permissions";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";
import { getObjectStorage } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DOWNLOAD_PERMISSIONS = [
  ...SC_SALES_ACCESS,
  ...SC_SERVICE_RETURN_REQUEST_PERMISSIONS,
  SC_RETURNS_PROCESS,
] as const;

/** ATR/ODRF PDF of a Service Return / Replacement on an SC sale, limited to the user's SCs. */
export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!DOWNLOAD_PERMISSIONS.some((slug) => hasPermission(session.user.permissions, slug))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const row = await prisma.serviceCenterReturnRequest.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...(scopedIds ? { sale: { serviceCenterId: { in: scopedIds } } } : {}),
    },
    select: { id: true, atrOdrfPdfPath: true, sale: { select: { transactionNo: true } } },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.atrOdrfPdfPath) {
    return NextResponse.json(
      { error: "ATR/ODRF PDF has not been generated for this request" },
      { status: 404 },
    );
  }

  try {
    const storage = await getObjectStorage();
    const file = await storage.download(row.atrOdrfPdfPath);
    const safeTrn = (row.sale.transactionNo || row.id).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ATR-ODRF-${safeTrn}.pdf"`,
      },
    });
  } catch (error) {
    logger.warn({ returnRequestId: row.id, err: error }, "sc ATR/ODRF download failed");
    return NextResponse.json({ error: "Failed to download ATR/ODRF PDF" }, { status: 500 });
  }
}
