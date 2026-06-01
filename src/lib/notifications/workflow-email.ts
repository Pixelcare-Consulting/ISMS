import { logger } from "@/lib/shared/logger";

interface SendWorkflowEmailInput {
  subject: string;
  body: string;
  to?: string[];
}

async function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

export async function sendWorkflowEmail(input: SendWorkflowEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM;
  const resend = await getResendClient();
  const to = input.to?.filter(Boolean) ?? [];

  if (!resend || !from) {
    logger.debug("Workflow email skipped — RESEND_API_KEY or EMAIL_FROM not set");
    return;
  }

  if (to.length === 0) {
    logger.debug({ subject: input.subject }, "Workflow email skipped — no recipients");
    return;
  }

  try {
    await resend.emails.send({
      from,
      to,
      subject: input.subject,
      html: `<p>${input.body}</p>`,
    });
  } catch (error) {
    logger.error({ error }, "Failed to send workflow email");
  }
}
