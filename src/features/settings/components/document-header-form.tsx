"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateDocumentHeaderAction } from "@/features/settings/actions/company.actions";
import {
  DOCUMENT_HEADER_MAX_LENGTH,
  DOCUMENT_HEADER_MAX_LINES,
} from "@/features/tenants/types/tenant-branding";

interface DocumentHeaderFormProps {
  initialValue: string;
  canEdit: boolean;
}

export function DocumentHeaderForm({ initialValue, canEdit }: DocumentHeaderFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateDocumentHeaderAction({ documentHeader: value });
      if ("error" in result && result.error) {
        setError(result.error);
        toast.error("Could not save document header", { description: result.error });
        return;
      }
      toast.success("Document header saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="document-header">Address and contact lines</Label>
        <Textarea
          id="document-header"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={!canEdit || pending}
          rows={DOCUMENT_HEADER_MAX_LINES}
          maxLength={DOCUMENT_HEADER_MAX_LENGTH}
          placeholder={"Street, city, postal code, country\nTel. No.: … / Fax No.: …"}
          aria-invalid={error ? true : undefined}
          aria-describedby="document-header-hint"
        />
        <p id="document-header-hint" className="text-xs text-muted-foreground">
          Printed beside the company logo on pull-out, transfer, release slip and delivery
          receipt print-outs. One line per row, up to {DOCUMENT_HEADER_MAX_LINES} lines.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save header"
          )}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact a tenant administrator to update the document header.
        </p>
      )}
    </form>
  );
}
