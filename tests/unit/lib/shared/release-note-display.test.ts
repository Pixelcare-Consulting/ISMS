import { RELEASES } from "@/content/releases";
import { visibleReleaseCopy } from "@/lib/shared/release-note-display";

describe("visibleReleaseCopy", () => {
  it("hides a summary line that is the start of a longer change", () => {
    const result = visibleReleaseCopy(
      [
        "SAP integration shows what was sent, what is waiting, and what needs another try.",
      ],
      [
        {
          type: "improvement",
          description:
            "SAP integration shows what was sent, what is waiting, and what needs another try. Choose a card to see that group.",
        },
      ],
    );

    expect(result.highlights).toEqual([]);
    expect(result.changes).toHaveLength(1);
  });

  it("hides a summary line that repeats a change word for word", () => {
    const result = visibleReleaseCopy(
      ["Each row uses the order or document number people already know."],
      [
        {
          type: "improvement",
          description:
            "Each row uses the order or document number people already know.",
        },
      ],
    );

    expect(result.highlights).toEqual([]);
    expect(result.changes.map((change) => change.type)).toEqual([
      "improvement",
    ]);
  });

  it("hides a summary when each of its sentences is already a change", () => {
    const result = visibleReleaseCopy(
      [
        "Each row uses the order number. Opening a row shows who sent it.",
      ],
      [
        {
          type: "improvement",
          description: "Each row uses the order number.",
        },
        {
          type: "improvement",
          description: "Opening a row shows who sent it and the document.",
        },
      ],
    );

    expect(result.highlights).toEqual([]);
    expect(result.changes).toHaveLength(2);
  });

  it("keeps a real summary and the changes that add detail", () => {
    const result = visibleReleaseCopy(
      [
        "A new sale warns when stock is over 30 days, and sales status uses the names from Settings.",
      ],
      [
        {
          type: "improvement",
          description:
            "Add Line Items on a new sale shows Model Aging Validation when the chosen model has stock over 30 days.",
        },
        {
          type: "improvement",
          description:
            "The status shown on a sale follows the Sales & ATR labels in Settings.",
        },
      ],
    );

    expect(result.highlights).toHaveLength(1);
    expect(result.changes).toHaveLength(2);
  });

  it("hides a change that a remaining summary already says", () => {
    const result = visibleReleaseCopy(
      [
        "Side menus now show section labels, the same way Inventory does, including Setup.",
      ],
      [
        {
          type: "improvement",
          description:
            "Side menus now show section labels, the same way Inventory does.",
        },
      ],
    );

    expect(result.highlights).toHaveLength(1);
    expect(result.changes).toEqual([]);
  });

  it("ignores case and punctuation when comparing", () => {
    const result = visibleReleaseCopy(
      ["The practice inventory-sync button is gone!"],
      [
        {
          type: "fix",
          description: "The practice inventory-sync button is gone.",
        },
      ],
    );

    expect(result.highlights).toEqual([]);
    expect(result.changes).toHaveLength(1);
  });

  it("shows the SAP integration notes once", () => {
    const release = RELEASES.find((item) => item.version === "0.94.5");
    expect(release).toBeDefined();

    const result = visibleReleaseCopy(release!.highlights, release!.changes);

    expect(result.highlights).toEqual([]);
    expect(result.changes).toHaveLength(release!.changes?.length ?? 0);
  });

  it("keeps the aging-stock summary because it is not a copy of the changes", () => {
    const release = RELEASES.find((item) => item.version === "0.95.2");
    expect(release).toBeDefined();

    const result = visibleReleaseCopy(release!.highlights, release!.changes);

    expect(result.highlights).toEqual(release!.highlights);
    expect(result.changes).toHaveLength(release!.changes?.length ?? 0);
  });

  it("shows every summary when there is no change list", () => {
    const result = visibleReleaseCopy(
      ["Sales ask you to confirm before they continue."],
      undefined,
    );

    expect(result.highlights).toEqual([
      "Sales ask you to confirm before they continue.",
    ]);
    expect(result.changes).toEqual([]);
  });
});
