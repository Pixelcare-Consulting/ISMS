import {
  PULLOUT_ATTACHMENT_MAX_BYTES,
  PULLOUT_ATTACHMENT_MAX_FILES,
  pulloutAttachmentError,
} from "@/features/logistics/constants/pullout-attachments";

const pdf = { mimeType: "application/pdf", sizeBytes: 1024, attachedCount: 0 };

describe("pull-out attachment rules", () => {
  it("accepts a PDF or image within the limits", () => {
    expect(pulloutAttachmentError(pdf)).toBeNull();
    expect(pulloutAttachmentError({ ...pdf, mimeType: "image/png" })).toBeNull();
    expect(pulloutAttachmentError({ ...pdf, sizeBytes: PULLOUT_ATTACHMENT_MAX_BYTES })).toBeNull();
  });

  it("refuses types a browser could run", () => {
    expect(pulloutAttachmentError({ ...pdf, mimeType: "image/svg+xml" })).toMatch(/pdf/i);
    expect(pulloutAttachmentError({ ...pdf, mimeType: "text/html" })).toMatch(/pdf/i);
    expect(pulloutAttachmentError({ ...pdf, mimeType: "" })).toMatch(/pdf/i);
  });

  it("refuses empty, oversized, and extra files", () => {
    expect(pulloutAttachmentError({ ...pdf, sizeBytes: 0 })).toMatch(/empty/i);
    expect(pulloutAttachmentError({ ...pdf, sizeBytes: PULLOUT_ATTACHMENT_MAX_BYTES + 1 })).toMatch(/4 MB/);
    expect(pulloutAttachmentError({ ...pdf, attachedCount: PULLOUT_ATTACHMENT_MAX_FILES })).toMatch(/up to/i);
  });
});
