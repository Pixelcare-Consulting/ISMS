import { letterheadHtml, printDocumentHtml } from "@/utils/print-document";
import { transferSlipsHtml } from "@/features/logistics/lib/transfer-slip-print";
import { splitDocumentHeader } from "@/features/tenants/types/tenant-branding";

const letterhead = {
  logo: "data:image/webp;base64,AAAA",
  companyName: "Acme <Corp>",
  lines: ["Lot 2 Block 1-A, Pasig City", "Tel. No.: 8875-5555 / Fax No.: 8835-6710"],
};

describe("letterheadHtml", () => {
  it("prints the logo beside each contact line", () => {
    const html = letterheadHtml(letterhead);
    expect(html).toContain('<img src="data:image/webp;base64,AAAA" alt="Acme &lt;Corp&gt;" />');
    expect(html).toContain("<p>Lot 2 Block 1-A, Pasig City</p><p>Tel. No.: 8875-5555 / Fax No.: 8835-6710</p>");
  });

  it("falls back to the company name when there is no logo", () => {
    const html = letterheadHtml({ ...letterhead, logo: null });
    expect(html).not.toContain("<img");
    expect(html).toContain('<div class="company-name">Acme &lt;Corp&gt;</div>');
  });

  it("prints no header when the tenant has neither logo nor lines", () => {
    expect(letterheadHtml({ logo: null, companyName: "Acme", lines: ["  "] })).toBe("");
    expect(letterheadHtml(null)).toBe("");
  });
});

describe("printDocumentHtml", () => {
  it("uses Ubuntu with a plain sans-serif fallback", () => {
    const html = printDocumentHtml({ title: "Slip", styles: "", body: "" });
    expect(html).toContain("family=Ubuntu");
    expect(html).toContain('font-family: "Ubuntu", Arial, Helvetica, sans-serif');
    expect(html).not.toContain("Georgia");
  });
});

describe("transferSlipsHtml", () => {
  it("puts the header on both the release slip and the delivery receipt", () => {
    const html = transferSlipsHtml(
      {
        transferNo: "XFR-1",
        rsNo: "RS-1",
        drNo: "DR-1",
        fromBranch: "Branch A",
        toBranch: "Branch B",
        lines: [{ serialNo: "SN1", model: "SKU1 Model" }],
      },
      letterhead,
    );
    expect(html.match(/class="letterhead"/g)).toHaveLength(2);
  });
});

describe("splitDocumentHeader", () => {
  it("keeps trimmed, non-blank lines", () => {
    expect(splitDocumentHeader(" Line 1 \r\n\n  \nLine 2")).toEqual(["Line 1", "Line 2"]);
    expect(splitDocumentHeader(null)).toEqual([]);
  });
});
