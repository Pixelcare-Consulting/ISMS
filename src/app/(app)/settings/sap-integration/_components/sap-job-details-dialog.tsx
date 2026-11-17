"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SapIntegrationJobStatus, SapIntegrationJobType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSapJobPeopleAction,
  getSapJobSupportAction,
  retrySapJobAction,
} from "@/features/sap/actions/sap.actions";
import {
  SAP_JOB_STATUS_LABELS,
  SAP_JOB_TYPE_LABELS,
  formatSapJobDate,
  sapDocumentKindLabel,
  sapJobDocumentNumber,
  sapJobLinesSummary,
  sapJobNumberText,
  sapJobPlace,
  sapJobStatusClassName,
} from "@/features/sap/constants/sap-job-types";
import { cn } from "@/utils/cn";

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
  createdAt: Date | string;
  updatedAt: Date | string;
  processedAt: Date | string | null;
  nextRetryAt: Date | string | null;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

/** What was sent, whether it reached SAP, and a retry when it failed. Technical ids stay folded away. */
export function SapJobDetailsDialog({
  job,
  onClose,
}: {
  job: SapJobDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const jobId = job?.id ?? null;
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null);
  const [people, setPeople] = useState<SapJobPeople | null>(null);
  const [support, setSupport] = useState<SapSupportField[] | null>(null);

  if (jobId !== loadedJobId) {
    setLoadedJobId(jobId);
    setPeople(null);
    setSupport(null);
  }

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    void getSapJobPeopleAction(jobId)
      .then((result) => {
        if (!cancelled) setPeople(result);
      })
      .catch(() => {
        if (!cancelled) setPeople({ sentBy: null, queuedBy: null });
      });
    void getSapJobSupportAction(jobId)
      .then((result) => {
        if (!cancelled) setSupport(result);
      })
      .catch(() => {
        if (!cancelled) setSupport([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const failed = job !== null && (job.status === "failed" || job.status === "dead_letter");
  const retryable = failed && Boolean(job.referenceType && job.referenceId);
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
        toast.success(result.sapDocRef ? `Sent to SAP: ${result.sapDocRef}` : "Sent to SAP.");
        onClose();
      } else {
        const errorText = "error" in result ? result.error : undefined;
        toast.error(errorText ?? "It was not sent. You can try again.");
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
                <Badge variant="outline" className={sapJobStatusClassName(job.status)}>
                  {SAP_JOB_STATUS_LABELS[job.status]}
                </Badge>
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
              <ResultNotice job={job} />

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border p-3 text-sm sm:grid-cols-2">
                {jobFacts(job, people).map((fact) => (
                  <Field
                    key={fact.label}
                    className={fact.wide ? "sm:col-span-2" : undefined}
                    label={fact.label}
                    value={fact.value}
                  />
                ))}
              </dl>

              {retryable ? (
                <Button className="max-sm:h-11" disabled={pending} onClick={retry}>
                  {pending ? "Trying…" : "Try again"}
                </Button>
              ) : null}

              <Collapsible className="rounded-md border">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold">
                  Technical details
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 border-t px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Job record</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="max-sm:h-11"
                      onClick={() =>
                        copy(technicalCopyText(job, support ?? [], payloadText), "Technical details")
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {jobTechnicalFacts(job).map((fact) => (
                      <Field
                        key={fact.label}
                        className={fact.wide ? "sm:col-span-2" : undefined}
                        label={fact.label}
                        value={fact.value}
                        mono
                      />
                    ))}
                  </dl>
                  {support && support.length > 0 ? (
                    <div className="space-y-3 border-t pt-3">
                      <h3 className="text-sm font-medium">Record posted</h3>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        {support.map((fact) => (
                          <Field key={fact.label} label={fact.label} value={fact.value} mono />
                        ))}
                      </dl>
                    </div>
                  ) : null}
                  <CopyBlock label="Payload" value={payloadText} pre />
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button variant="outline" className="max-sm:h-11" disabled={pending} onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface SapJobPeople {
  sentBy: string | null;
  queuedBy: string | null;
}

interface SapSupportField {
  label: string;
  value: string;
}

function jobTechnicalFacts(job: SapJobDetail): { label: string; value: string; wide?: boolean }[] {
  const facts: { label: string; value: string; wide?: boolean }[] = [
    { label: "Job ID", value: job.id },
    { label: "Job type", value: job.jobType },
    { label: "Status code", value: job.status },
    { label: "Reference type", value: job.referenceType ?? "—" },
    { label: "Reference ID", value: job.referenceId ?? "—" },
    { label: "Idempotency key", value: job.idempotencyKey, wide: true },
    { label: "SAP doc ref", value: job.sapDocRef?.trim() || "—" },
    { label: "Attempts", value: `${job.attemptCount} / ${job.maxAttempts}` },
    { label: "Created", value: isoStamp(job.createdAt) },
    { label: "Updated", value: isoStamp(job.updatedAt) },
    { label: "Processed", value: isoStamp(job.processedAt) },
    { label: "Next retry", value: isoStamp(job.nextRetryAt) },
  ];
  const error = job.lastError?.trim();
  if (error) facts.push({ label: "Last error", value: error, wide: true });
  return facts;
}

function technicalCopyText(
  job: SapJobDetail,
  support: SapSupportField[],
  payloadText: string,
): string {
  const lines = jobTechnicalFacts(job).map((fact) => `${fact.label}: ${fact.value}`);
  if (support.length > 0) {
    lines.push("", "Record posted");
    lines.push(...support.map((fact) => `${fact.label}: ${fact.value}`));
  }
  lines.push("", "Payload", payloadText);
  return lines.join("\n");
}

function isoStamp(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString();
}

function jobFacts(
  job: SapJobDetail,
  people: SapJobPeople | null,
): { label: string; value: string; wide?: boolean }[] {
  const facts: { label: string; value: string; wide?: boolean }[] = [
    { label: "ISMS document", value: sapJobDocumentNumber(job.payload) },
    { label: "SAP number", value: sapJobNumberText(job.sapDocRef) },
  ];
  const kind = sapDocumentKindLabel(job.sapDocRef, job.payload);
  if (kind) facts.push({ label: "SAP document", value: kind });
  const place = sapJobPlace(job.payload);
  if (place) facts.push(place);
  const lines = sapJobLinesSummary(job.payload);
  if (lines) facts.push({ label: "Items", value: lines, wide: true });
  facts.push(...peopleFacts(job.status, people));
  facts.push({ label: "Queued", value: formatSapJobDate(job.createdAt) });
  if (job.processedAt) facts.push({ label: "Sent", value: formatSapJobDate(job.processedAt) });
  if (job.nextRetryAt) {
    facts.push({ label: "Next automatic retry", value: formatSapJobDate(job.nextRetryAt) });
  }
  facts.push({
    label: "Tries",
    value: `Tried ${job.attemptCount} of ${job.maxAttempts} times`,
  });
  return facts;
}

function peopleFacts(
  status: SapJobDetail["status"],
  people: SapJobPeople | null,
): { label: string; value: string }[] {
  if (!people) {
    return [{ label: status === "completed" ? "Sent by" : "Queued by", value: "…" }];
  }
  const { sentBy, queuedBy } = people;
  if (status === "completed") {
    const rows = [{ label: "Sent by", value: sentBy ?? queuedBy ?? "Not recorded" }];
    if (queuedBy && sentBy && queuedBy !== sentBy) {
      rows.push({ label: "Queued by", value: queuedBy });
    }
    return rows;
  }
  const rows = [{ label: "Queued by", value: queuedBy ?? sentBy ?? "Not recorded" }];
  if (sentBy && queuedBy && sentBy !== queuedBy) {
    rows.push({ label: "Sent by", value: sentBy });
  }
  return rows;
}

function Field({
  label,
  value,
  className,
  mono = false,
}: {
  label: string;
  value: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function ResultNotice({ job }: { job: SapJobDetail }) {
  const notice = resultNotice(job);
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm break-words whitespace-pre-wrap",
        notice.className,
      )}
    >
      {notice.text}
    </p>
  );
}

function resultNotice(job: SapJobDetail): { text: string; className: string } {
  switch (job.status) {
    case "completed": {
      const number = job.sapDocRef?.trim();
      return {
        text: number
          ? `This document was sent to SAP. SAP number: ${number}.`
          : "This document was sent to SAP.",
        className:
          "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      };
    }
    case "failed":
      return {
        text: job.lastError?.trim() || "This document needs another try.",
        className: "border-destructive/40 bg-destructive/5 text-destructive",
      };
    case "dead_letter": {
      const error = job.lastError?.trim();
      const ending = "It will not be sent again automatically.";
      return {
        text: error
          ? `${error}\n\n${ending}`
          : `This document could not be sent. ${ending}`,
        className: "border-destructive/40 bg-destructive/5 text-destructive",
      };
    }
    case "pending":
    case "processing":
      return {
        text: "This document has not been sent yet.",
        className: "border-border bg-muted/50 text-foreground",
      };
    default: {
      const _exhaustive: never = job.status;
      return _exhaustive;
    }
  }
}

function CopyBlock({
  label,
  value,
  empty = "—",
  mono = false,
  pre = false,
}: {
  label: string;
  value: string;
  empty?: string;
  mono?: boolean;
  pre?: boolean;
}) {
  const copyable = value.trim().length > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        <Button
          size="sm"
          variant="outline"
          className="max-sm:h-11"
          disabled={!copyable}
          onClick={() => copy(value, label)}
        >
          Copy
        </Button>
      </div>
      {pre ? (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
          {copyable ? value : empty}
        </pre>
      ) : (
        <p className={`text-sm break-all ${mono ? "font-mono text-xs" : ""}`}>
          {copyable ? value : empty}
        </p>
      )}
    </div>
  );
}
