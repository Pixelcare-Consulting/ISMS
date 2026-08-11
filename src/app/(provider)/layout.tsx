import type { Metadata } from "next";
import { headers } from "next/headers";

import { ProviderShell } from "@/app/(provider)/_components/provider-shell";
import { DocumentTitle } from "@/components/document-title";
import { resolveRouteTitle } from "@/config/route-titles";
import { requirePlatformOperator } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const title = resolveRouteTitle(pathname);
  return title ? pageMetadata(title) : pageMetadata("Provider");
}

export default async function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePlatformOperator();

  return (
    <>
      <DocumentTitle />
      <ProviderShell
        user={{
          name: session.user.name,
          email: session.user.email,
        }}
      >
        {children}
      </ProviderShell>
    </>
  );
}
