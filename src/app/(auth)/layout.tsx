import type { Metadata } from "next";
import { headers } from "next/headers";

import { AuthShell } from "@/app/(auth)/_components/auth-shell";
import { DocumentTitle } from "@/components/document-title";
import { resolveRouteTitle } from "@/config/route-titles";
import { pageMetadata } from "@/lib/shared/seo";

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const title = resolveRouteTitle(pathname);
  return title ? pageMetadata(title) : {};
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DocumentTitle />
      <AuthShell>{children}</AuthShell>
    </>
  );
}
