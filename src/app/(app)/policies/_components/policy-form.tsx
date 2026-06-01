"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { toast } from "sonner";

import {
  createPolicyAction,
  updatePolicyAction,
} from "@/features/policies/actions/policy.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PolicyFormProps {
  mode: "create" | "edit";
  policy?: {
    id: string;
    title: string;
    description: string | null;
    content: string;
  };
}

export function PolicyForm({ mode, policy }: PolicyFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (mode === "edit" && policy) {
      formData.set("policyId", policy.id);
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createPolicyAction(formData)
          : await updatePolicyAction(formData);

      if (result.error) {
        setError(result.error);
        toast.error("Could not save policy", { description: result.error });
        return;
      }

      toast.success(mode === "create" ? "Policy created" : "Policy saved");
      const targetId =
        "policyId" in result && result.policyId ? result.policyId : policy?.id;
      if (targetId) {
        router.push(`/policies/${targetId}`);
      } else {
        router.push("/policies");
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      encType="multipart/form-data"
    >
      <div className="space-y-2">
        <Label htmlFor="policy-title">Title</Label>
        <Input
          id="policy-title"
          name="title"
          defaultValue={policy?.title}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="policy-description">Description</Label>
        <Input
          id="policy-description"
          name="description"
          defaultValue={policy?.description ?? ""}
          maxLength={500}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="policy-content">Content</Label>
        <Textarea
          id="policy-content"
          name="content"
          defaultValue={policy?.content}
          required
          rows={14}
          className="font-mono text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label>Attachment (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          name="attachment"
          accept=".pdf,.docx,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setAttachmentName(file?.name ?? null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file
          </Button>
          {attachmentName ? (
            <span className="text-sm text-muted-foreground">{attachmentName}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              PDF, DOCX, or PNG up to 10 MB
            </span>
          )}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/policies")}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create policy" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
