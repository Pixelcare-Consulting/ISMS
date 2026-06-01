import { logger } from "@/lib/shared/logger";

export type PolicyReviewEmailEvent = "submitted" | "approved" | "reverted";

interface SendPolicyReviewEmailInput {
  to: string[];
  event: PolicyReviewEmailEvent;
  policyTitle: string;
  policyUrl: string;
  actorName: string;
  comment?: string | null;
}

async function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

function buildSubject(event: PolicyReviewEmailEvent, policyTitle: string) {
  switch (event) {
    case "submitted":
      return `Policy submitted for review: ${policyTitle}`;
    case "approved":
      return `Policy approved: ${policyTitle}`;
    case "reverted":
      return `Policy reverted to draft: ${policyTitle}`;
  }
}

function buildBody(input: SendPolicyReviewEmailInput) {
  const actionLabel =
    input.event === "submitted"
      ? "submitted for review"
      : input.event === "approved"
        ? "approved"
        : "reverted to draft";

  const commentBlock = input.comment
    ? `<p><strong>Comment:</strong> ${escapeHtml(input.comment)}</p>`
    : "";

  return `
    <p>${escapeHtml(input.actorName)} ${actionLabel} the policy <strong>${escapeHtml(input.policyTitle)}</strong>.</p>
    ${commentBlock}
    <p><a href="${escapeHtml(input.policyUrl)}">View policy</a></p>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPolicyReviewEmail(
  input: SendPolicyReviewEmailInput,
): Promise<void> {
  const recipients = input.to.filter(Boolean);
  if (recipients.length === 0) {
    return;
  }

  const from = process.env.EMAIL_FROM;
  const resend = await getResendClient();

  if (!resend || !from) {
    logger.debug("Policy email skipped — RESEND_API_KEY or EMAIL_FROM not set");
    return;
  }

  try {
    await resend.emails.send({
      from,
      to: recipients,
      subject: buildSubject(input.event, input.policyTitle),
      html: buildBody(input),
    });
  } catch (error) {
    logger.error({ error, event: input.event }, "Failed to send policy email");
  }
}
