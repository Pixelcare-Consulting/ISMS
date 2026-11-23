import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { toAppSession } from "@/lib/auth/session";

/**
 * Hands the Stimulsoft license key to signed-in users only. The viewer runs in
 * the browser, so the key cannot stay secret from them, but it is kept out of
 * the public JS bundle and read from runtime config (no rebuild per environment).
 */
export async function GET() {
  const session = toAppSession(await auth());
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.STIMULSOFT_LICENSE_KEY?.trim();
  if (!key) {
    return NextResponse.json({ key: null }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ key }, { headers: { "Cache-Control": "private, no-store" } });
}
