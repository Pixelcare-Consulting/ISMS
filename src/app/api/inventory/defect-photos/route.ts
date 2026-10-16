import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/permissions";
import { DEFECT_REPORT_PHOTOS_PREFIX, getObjectStorage } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function mimeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
    if (lower.endsWith(ext)) return mime;
  }
  return "application/octet-stream";
}

/** Serves defect report photos under the tenant's defect-report-photos prefix. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("inventory.view");
    const url = new URL(request.url);
    const storagePath = url.searchParams.get("path")?.trim() ?? "";
    if (!storagePath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const expectedPrefix = `${DEFECT_REPORT_PHOTOS_PREFIX}/tenants/${session.user.tenantId}/`;
    if (
      storagePath.includes("..") ||
      storagePath.includes("\\") ||
      !storagePath.startsWith(expectedPrefix)
    ) {
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
    }

    const storage = await getObjectStorage();
    const { buffer } = await storage.download(storagePath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeFromPath(storagePath),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
