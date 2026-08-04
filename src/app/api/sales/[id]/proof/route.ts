import { NextResponse } from "next/server";

import { SALES_ACCESS_PERMISSIONS } from "@/features/sales/constants/sales-permissions";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import {
  parseSaleProofPaths,
  saleProofFileName,
  saleProofMimeType,
} from "@/features/sales/utils/sale-proof";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { toAppSession } from "@/lib/auth/session";
import { getObjectStorage } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function prefersHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return true;
  // New-tab navigation often has broad Accept including html first.
  return !accept.includes("application/json");
}

function proofErrorResponse(
  request: Request,
  status: number,
  title: string,
  message: string,
) {
  if (!prefersHtml(request)) {
    return NextResponse.json({ error: message }, { status });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · FINDEN ISMS</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: #f4f4f5;
      color: #18181b;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #09090b; color: #fafafa; }
      .card { background: #18181b; border-color: #27272a; }
      .muted { color: #a1a1aa; }
      .btn { background: #27272a; color: #fafafa; border-color: #3f3f46; }
    }
    .card {
      width: min(28rem, calc(100vw - 2rem));
      padding: 1.75rem 1.5rem;
      border-radius: 0.75rem;
      border: 1px solid #e4e4e7;
      background: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      text-align: center;
    }
    h1 { font-size: 1.125rem; margin: 0 0 0.5rem; font-weight: 600; }
    p { margin: 0 0 1.25rem; line-height: 1.5; font-size: 0.9375rem; }
    .muted { color: #71717a; }
    .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 0.9rem;
      border-radius: 0.5rem;
      border: 1px solid #d4d4d8;
      background: #fff;
      color: #18181b;
      font: inherit;
      font-size: 0.875rem;
      text-decoration: none;
      cursor: pointer;
    }
    .btn:hover { filter: brightness(0.97); }
  </style>
</head>
<body>
  <main class="card" role="main">
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
    <div class="actions">
      <button type="button" class="btn" onclick="window.close()">Close tab</button>
      <a class="btn" href="/sales">Back to Sales</a>
    </div>
  </main>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function GET(request: Request, context: RouteContext) {
  const session = toAppSession(await auth());
  if (!session?.user?.tenantId) {
    return proofErrorResponse(
      request,
      401,
      "Sign in required",
      "You need to be signed in to review this proof attachment.",
    );
  }

  const canAccess = SALES_ACCESS_PERMISSIONS.some((slug) =>
    hasPermission(session.user.permissions, slug),
  );
  if (!canAccess) {
    return proofErrorResponse(
      request,
      403,
      "Access denied",
      "You do not have permission to review sales proof attachments.",
    );
  }

  const { id: saleId } = await context.params;
  const { searchParams } = new URL(request.url);
  const indexRaw = searchParams.get("index");
  const index = indexRaw == null ? Number.NaN : Number.parseInt(indexRaw, 10);
  if (!Number.isInteger(index) || index < 0) {
    return proofErrorResponse(
      request,
      400,
      "Invalid proof link",
      "This proof link is incomplete. Open the sale again and choose Review proof.",
    );
  }

  const sale = await salesRepository.findSaleDetailsForTenant(
    session.user.tenantId,
    saleId,
  );
  if (!sale) {
    return proofErrorResponse(
      request,
      404,
      "Sale not found",
      "This sale could not be found, so the proof cannot be opened.",
    );
  }

  const proofPaths = parseSaleProofPaths(sale.proof);
  const storagePath = proofPaths[index];
  if (!storagePath) {
    return proofErrorResponse(
      request,
      404,
      "Proof not available",
      "No proof file is linked to this sale, or the attachment index is out of range.",
    );
  }

  try {
    const storage = getObjectStorage();
    const { buffer } = await storage.download(storagePath);
    const fileName = saleProofFileName(storagePath);
    const mimeType = saleProofMimeType(storagePath);
    const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, escape);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return proofErrorResponse(
      request,
      404,
      "Proof file missing",
      "The proof attachment is recorded on this sale, but the file is no longer on the server. Ask the team to re-upload the proof, or close this tab and continue from Sales.",
    );
  }
}
