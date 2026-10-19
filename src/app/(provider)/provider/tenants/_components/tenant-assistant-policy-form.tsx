"use client";

import type { AiAssistantPolicyInput } from "@/features/ai/services/assistant-policy.service";
import { updateProviderAiAssistantPolicyAction } from "@/features/provider/actions/provider-assistant.actions";
import { AiAssistantPolicyForm } from "@/features/settings/components/ai-assistant-policy-form";

export function TenantAssistantPolicyForm(props: {
  tenantId: string;
  initialValues: AiAssistantPolicyInput;
  canEdit: boolean;
}) {
  return (
    <AiAssistantPolicyForm
      initialValues={props.initialValues}
      canEdit={props.canEdit}
      readOnlyMessage="Restore this organization before changing the assistant."
      savePolicy={(input) => updateProviderAiAssistantPolicyAction(props.tenantId, input)}
    />
  );
}
