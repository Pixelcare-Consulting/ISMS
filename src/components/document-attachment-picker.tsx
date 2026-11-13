"use client";

import type { ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DOCUMENT_ATTACHMENT_ACCEPT,
  DOCUMENT_ATTACHMENT_HINT,
  DOCUMENT_ATTACHMENT_MAX_FILES,
  documentAttachmentError,
} from "@/lib/storage/document-attachment-rules";

/**
 * Files picked for a document that is not saved yet. They upload after the document is
 * created, so this only checks each file against the shared rules and keeps the list.
 */
export function DocumentAttachmentPicker({
  id,
  files,
  onFilesChange,
  disabled = false,
}: {
  id: string;
  files: readonly File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])];
    // Clear the input so picking the same file again after removing it still fires.
    event.target.value = "";
    const next = [...files];
    for (const file of picked) {
      const refused = documentAttachmentError({
        mimeType: file.type,
        sizeBytes: file.size,
        attachedCount: next.length,
      });
      if (refused) {
        toast.error(`${file.name}: ${refused}`);
        continue;
      }
      next.push(file);
    }
    onFilesChange(next);
  }

  return (
    <div className="space-y-2 pt-1">
      <Input
        id={id}
        type="file"
        multiple
        accept={DOCUMENT_ATTACHMENT_ACCEPT}
        disabled={disabled || files.length >= DOCUMENT_ATTACHMENT_MAX_FILES}
        onChange={addFiles}
      />
      <p className="text-xs text-muted-foreground">{DOCUMENT_ATTACHMENT_HINT}</p>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                onClick={() => onFilesChange(files.filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
