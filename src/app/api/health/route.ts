import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the Docker HEALTHCHECK and Compose `depends_on`.
 * Excluded from the auth proxy and from maintenance mode so orchestration
 * never mistakes a closed app for a dead one. Returns 503 when the database
 * is unreachable, which is what should stop traffic being routed here.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
