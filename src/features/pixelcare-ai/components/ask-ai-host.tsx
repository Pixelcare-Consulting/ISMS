import { headers } from "next/headers";

import { AskAiDrawer } from "@/features/pixelcare-ai/components/ask-ai-drawer";
import {
  canUsePixelcareAi,
  isPixelcareAiSampleMode,
} from "@/features/pixelcare-ai/constants/permissions";
import { isPixelcareAiProviderConfigured } from "@/features/pixelcare-ai/lib/provider";
import type { PixelcareAiContext } from "@/features/pixelcare-ai/schemas/context.schema";
import { getSession } from "@/lib/auth/permissions";

export async function AskAiHost(props: {
  recordType?: PixelcareAiContext["recordType"];
  recordId?: string | null;
  branchId?: string | null;
}) {
  const session = await getSession();
  if (
    !session ||
    !canUsePixelcareAi({
      userId: session.user.id,
      email: session.user.email,
      permissions: session.user.permissions,
    })
  ) {
    return null;
  }

  const pathname = (await headers()).get("x-pathname") ?? "";
  const pageContext: PixelcareAiContext = {
    pathname,
    recordType: props.recordType ?? null,
    recordId: props.recordId ?? null,
    branchId: props.branchId ?? null,
  };

  return (
    <AskAiDrawer
      pageContext={pageContext}
      providerConfigured={isPixelcareAiProviderConfigured()}
      sampleMode={isPixelcareAiSampleMode()}
    />
  );
}
