"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { SapIntegrationJobStatus, SapIntegrationJobType } from "@prisma/client";

import { retrySapJobAction } from "@/features/sap/actions/sap.actions";
import {
  SAP_JOB_STATUS_LABELS,
  SAP_JOB_TYPE_LABELS,
} from "@/features/sap/constants/sap-job-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SapJobDetail {
  id: string;
  jobType: SapIntegrationJobType;
  status: SapIntegrationJobStatus;
  idempotencyKey: string;
  referenceType: string | null;
  referenceId: string | null;
  sapDocRef: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  nextRetryAt: Date | null;
}

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium" });

function formatDate(value: Date | null): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

/** Full record of one SAP job: complete error text, payload, timing, and a retry for failed jobs. */
export function SapJobDetailsDialog({
  job,
  onClose,
}: {
  job: SapJobDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const retryable =
    job !== null &&
    (job.status === "failed" || job.status === "dead_letter") &&
    Boolean(job.referenceType && job.referenceId);
  const payloadText = job ? JSON.stringify(job.payload, null, 2) : "";

  function retry() {
    if (!job) return;
    startTransition(async () => {
      const response = await retrySapJobAction(job.id);
      if ("error" in response) {
        toast.error(response.error);
        return;
      }
      const { result } = response;
      if (result.status === "completed") {
        toast.success(result.sapDocRef ? `Posted to SAP: ${result.sapDocRef}` : "Posted to SAP");
        onClose();
      } else {
        toast.error(result.error ? `SAP still refused it: ${result.error}` : "The job did not complete.");
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={job !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {job ? (
          <>
            <DialogHeader>
              <DialogTitle>{SAP_JOB_TYPE_LABELS[job.jobType]}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{SAP_JOB_STATUS_LABELS[job.status]}</Badge>
                <span>
                  SAP doc: <span className="font-mono text-foreground">{job.sapDocRef ?? "none yet"}</span>
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
              {job.lastError ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Last error</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="max-sm:h-11"
                      onClick={() => copy(job.lastError ?? "", "Error")}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm break-words whitespace-pre-wrap text-destructive">
                    {job.lastError}
                  </p>
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Details</h3>
                <dl className="grid gap-x-6 gap-y-3 rounded-md border p-3 text-sm sm:grid-cols-2">
                  <Field label="Reference type" value={job.referenceType ?? "—"} />
                  <Field label="Reference ID" value={job.referenceId ?? "—"} mono />
                  <Field label="Idempotency key" value={job.idempotencyKey} mono />
                  <Field label="Attempts" value={`${job.attemptCount} of ${job.maxAttempts}`} />
                  <Field label="Created" value={formatDate(job.createdAt)} />
                  <Field label="Last updated" value={formatDate(job.updatedAt)} />
                  <Field label="Processed" value={formatDate(job.processedAt)} />
                  <Field label="Next automatic retry" value={formatDate(job.nextRetryAt)} />
                </dl>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Payload sent</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="max-sm:h-11"
                    onClick={() => copy(payloadText, "Payload")}
                  >
                    Copy
                  </Button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {payloadText}
                </pre>
              </section>
            </div>

            <DialogFooter>
              <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
                Close
              </Button>
              {retryable ? (
                <Button className="max-sm:h-11" disabled={pending} onClick={retry}>
                  {pending ? "Retrying…" : "Retry this job"}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
