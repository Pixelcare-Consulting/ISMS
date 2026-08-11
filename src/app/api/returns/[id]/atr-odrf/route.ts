import { NextResponse } from "next/server";

import {
  RETURNS_BRANCH_VIEW_PERMISSIONS,
  RETURNS_COMPLETE,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_REQUEST,
} from "@/features/returns/constants/returns-permissions";
import {
  SALES_RETURN_APPROVE,
  SALES_RETURN_COMPLETE,
  SALES_RETURN_EVALUATE,
  SALES_RETURN_REQUEST,
  SALES_RETURN_VIEW,
} from "@/features/sales/constants/sales-permissions";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";
import { getObjectStorage } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DOWNLOAD_PERMISSIONS = [
  ...RETURNS_BRANCH_VIEW_PERMISSIONS,
  RETURNS_REQUEST,
  RETURNS_EVALUATE,
  RETURNS_APPROVE,
  RETURNS_COMPLETE,
  SALES_RETURN_VIEW,
  SALES_RETURN_REQUEST,
  SALES_RETURN_EVALUATE,
  SALES_RETURN_APPROVE,
  SALES_RETURN_COMPLETE,
] as const;

export async function GET(_request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = DOWNLOAD_PERMISSIONS.some((slug) =>
    hasPermission(session.user.permissions, slug),
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: {
      id: true,
      atrOdrfPdfPath: true,
      sale: { select: { transactionNo: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.atrOdrfPdfPath) {
    return NextResponse.json(
      { error: "ATR/ODRF PDF has not been generated for this return" },
      { status: 404 },
    );
  }

  try {
    const storage = getObjectStorage();
    const file = await storage.download(row.atrOdrfPdfPath);
    const safeTrn = (row.sale.transactionNo || row.id)
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .slice(0, 60);

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ATR-ODRF-${safeTrn}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to download ATR/ODRF PDF" },
      { status: 500 },
    );
  }
}
