import {
  DOCUMENT_ATTACHMENT_MAX_BYTES,
  DOCUMENT_ATTACHMENT_MAX_FILES,
  documentAttachmentError,
  inlineContentDisposition,
} from "@/lib/storage/document-attachment-rules";

const pdf = { mimeType: "application/pdf", sizeBytes: 1024, attachedCount: 0 };

describe("document attachment rules", () => {
  it("accepts a PDF or image within the limits", () => {
    expect(documentAttachmentError(pdf)).toBeNull();
    expect(documentAttachmentError({ ...pdf, mimeType: "image/webp" })).toBeNull();
    expect(documentAttachmentError({ ...pdf, sizeBytes: DOCUMENT_ATTACHMENT_MAX_BYTES })).toBeNull();
  });

  it("refuses other types, empty and oversized files, and too many files", () => {
    expect(documentAttachmentError({ ...pdf, mimeType: "text/html" })).toMatch(/pdf/i);
    expect(documentAttachmentError({ ...pdf, sizeBytes: 0 })).toMatch(/empty/i);
    expect(documentAttachmentError({ ...pdf, sizeBytes: DOCUMENT_ATTACHMENT_MAX_BYTES + 1 })).toMatch(
      /4 MB/,
    );
    expect(
      documentAttachmentError({ ...pdf, attachedCount: DOCUMENT_ATTACHMENT_MAX_FILES }),
    ).toMatch(/up to/i);
  });

  it("encodes the file name so it cannot break the header", () => {
    expect(inlineContentDisposition('a "b";c.pdf')).toBe(
      "inline; filename*=UTF-8''a%20%22b%22%3Bc.pdf",
    );
    expect(inlineContentDisposition("o'(x)*.pdf")).toBe(
      "inline; filename*=UTF-8''o%27%28x%29%2A.pdf",
    );
  });
});
