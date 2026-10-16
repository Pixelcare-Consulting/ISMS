import { NextResponse } from "next/server";

import { requirePixelcareAiApiAccess } from "@/features/pixelcare-ai/lib/access";
import { listPermittedBranches } from "@/features/pixelcare-ai/tools/branch-access";

export async function GET() {
  const access = await requirePixelcareAiApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const branches = await listPermittedBranches(access.session);
  return NextResponse.json({ branches });
}
