"use client";

import { useCallback, useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import {
  Bold,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  TableIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { ANNOUNCEMENT_PROSE_CLASS } from "@/features/announcements/lib/announcement-prose";
import { uploadAnnouncementImageAction } from "@/features/announcements/actions/announcement.actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface AnnouncementRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AnnouncementRichEditor({
  value,
  onChange,
  disabled = false,
  placeholder = "Write your announcement…",
  className,
}: AnnouncementRichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // TipTap v3 StarterKit ships Link; keep our standalone Link config instead.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          class: "max-h-80 rounded-md",
        },
      }),
      Table.configure({
        resizable: false,
        renderWrapper: true,
        HTMLAttributes: {
          class: "announcement-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          ANNOUNCEMENT_PROSE_CLASS,
          "min-h-[160px] cursor-text bg-card px-3 py-2 text-foreground focus:outline-none",
        ),
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: trimmed })
      .run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }, [editor]);

  const insertImageFromFile = useCallback(
    async (file: File) => {
      if (!editor || uploadingRef.current) return;
      uploadingRef.current = true;
      try {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadAnnouncementImageAction(formData);
        if ("error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        if (!("url" in result) || !result.url) {
          toast.error("Upload failed");
          return;
        }
        editor
          .chain()
          .focus()
          .setImage({ src: result.url, alt: file.name })
          .run();
      } finally {
        uploadingRef.current = false;
      }
    },
    [editor],
  );

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-50 rounded-md border border-input bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm",
          className,
        )}
      >
        Loading editor…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-input bg-card shadow-sm",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={setLink}
        >
          <Link2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert image"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert table"
          active={editor.isActive("table")}
          disabled={disabled}
          onClick={insertTable}
        >
          <TableIcon className="size-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void insertImageFromFile(file);
        }}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-7",
        active && "bg-accent text-accent-foreground",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
