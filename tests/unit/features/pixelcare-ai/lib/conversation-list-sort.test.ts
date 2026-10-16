import { sortConversationListItems } from "@/features/pixelcare-ai/lib/conversation-list-sort";

describe("sortConversationListItems", () => {
  it("orders pinned first by pinnedAt desc, then updatedAt desc", () => {
    const items = [
      {
        id: "a",
        pinnedAt: null,
        updatedAt: "2026-10-16T12:00:00.000Z",
      },
      {
        id: "b",
        pinnedAt: "2026-10-16T10:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
      },
      {
        id: "c",
        pinnedAt: "2026-10-16T11:00:00.000Z",
        updatedAt: "2026-10-16T07:00:00.000Z",
      },
      {
        id: "d",
        pinnedAt: null,
        updatedAt: "2026-10-16T09:00:00.000Z",
      },
    ];

    expect(sortConversationListItems(items).map((item) => item.id)).toEqual([
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("keeps relative updatedAt order when neither item is pinned", () => {
    const items = [
      { id: "older", pinnedAt: null, updatedAt: "2026-10-15T00:00:00.000Z" },
      { id: "newer", pinnedAt: null, updatedAt: "2026-10-16T00:00:00.000Z" },
    ];

    expect(sortConversationListItems(items).map((item) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});
