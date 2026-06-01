"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PolicyActivityTimeline } from "@/app/(app)/policies/_components/policy-activity-timeline";
import { PolicyVersionHistory } from "@/app/(app)/policies/_components/policy-version-history";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
}

interface PolicyDetailContentProps {
  policyId: string;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    content: string;
    createdAt: Date;
    authorName: string;
    attachments: AttachmentRow[];
  }>;
  reviewEvents: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: Date;
    userName: string;
  }>;
  canExportPdf: boolean;
}

type Panel = "current" | "history" | "activity";

export function PolicyDetailContent({
  policyId,
  versions,
  reviewEvents,
  canExportPdf,
}: PolicyDetailContentProps) {
  const latestVersion = versions[0]?.version ?? 1;
  const [panel, setPanel] = useState<Panel>("current");
  const [selectedVersion, setSelectedVersion] = useState(latestVersion);

  const selected = useMemo(
    () => versions.find((v) => v.version === selectedVersion) ?? versions[0],
    [versions, selectedVersion],
  );

  const attachments = selected?.attachments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["current", "Current"],
            ["history", "Version history"],
            ["activity", "Activity"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={panel === key ? "default" : "outline"}
            onClick={() => setPanel(key)}
          >
            {label}
          </Button>
        ))}
        {canExportPdf ? (
          <Button type="button" size="sm" variant="outline" asChild className="ml-auto">
            <Link href={`/api/policies/${policyId}/pdf`} target="_blank">
              Export PDF
            </Link>
          </Button>
        ) : null}
      </div>

      {panel === "history" ? (
        <PolicyVersionHistory
          versions={versions}
          selectedVersion={selectedVersion}
          onSelectVersion={(version) => {
            setSelectedVersion(version);
            setPanel("current");
          }}
        />
      ) : null}

      {panel === "activity" ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <PolicyActivityTimeline events={reviewEvents} />
        </div>
      ) : null}

      {panel === "current" ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                Viewing version <strong className="text-foreground">v{selected?.version}</strong>
              </span>
              {selected && selected.version !== latestVersion ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setSelectedVersion(latestVersion)}
                >
                  Back to latest
                </button>
              ) : null}
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {selected?.content ?? ""}
            </pre>
          </div>

          {attachments.length > 0 ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium">Attachments</p>
              <ul className="space-y-2">
                {attachments.map((file) => (
                  <li key={file.id}>
                    <Link
                      href={`/api/policies/${policyId}/attachment?attachmentId=${file.id}`}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        "hover:bg-muted/50",
                      )}
                    >
                      {file.fileName}
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(file.sizeBytes / 1024)} KB)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
