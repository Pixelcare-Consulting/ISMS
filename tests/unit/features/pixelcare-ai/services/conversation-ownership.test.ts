import { conversationService } from "@/features/pixelcare-ai/services/conversation.service";
import { conversationRepository } from "@/features/pixelcare-ai/repositories/conversation.repository";

jest.mock("@/features/pixelcare-ai/repositories/conversation.repository", () => ({
  conversationRepository: {
    findOwnedMeta: jest.fn(),
    findOwned: jest.fn(),
    listForOwner: jest.fn(),
    create: jest.fn(),
    updateOwned: jest.fn(),
    softDeleteOwned: jest.fn(),
    createMessage: jest.fn(),
    touch: jest.fn(),
    listRecentMessages: jest.fn(),
  },
}));

const repo = conversationRepository as jest.Mocked<typeof conversationRepository>;

describe("conversation ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects get/patch/delete when the conversation is not owned", async () => {
    repo.findOwnedMeta.mockResolvedValue(null);

    await expect(
      conversationService.assertOwned("tenant-a", "user-a", "conv-1"),
    ).rejects.toThrow("Conversation not found.");

    await expect(
      conversationService.softDelete("tenant-a", "user-a", "conv-1"),
    ).rejects.toThrow("Conversation not found.");
  });

  it("loads a conversation only for the requesting user", async () => {
    repo.findOwned.mockResolvedValue(null);
    await conversationService.getOwned("tenant-a", "user-b", "conv-1");
    expect(repo.findOwned).toHaveBeenCalledWith("tenant-a", "user-b", "conv-1");
    expect(repo.findOwned).not.toHaveBeenCalledWith("tenant-a", "user-a", "conv-1");
  });

  it("allows assertOwned for matching tenant and user", async () => {
    repo.findOwnedMeta.mockResolvedValue({
      id: "conv-1",
      tenantId: "tenant-a",
      userId: "user-a",
      title: "Hello",
      contextJson: null,
      pinnedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await expect(
      conversationService.assertOwned("tenant-a", "user-a", "conv-1"),
    ).resolves.toMatchObject({ id: "conv-1" });
  });

  it("rejects pin patch when the conversation is not owned", async () => {
    repo.findOwnedMeta.mockResolvedValue(null);

    await expect(
      conversationService.patch({
        tenantId: "tenant-a",
        userId: "user-a",
        id: "conv-1",
        pinned: true,
      }),
    ).rejects.toThrow("Conversation not found.");

    expect(repo.updateOwned).not.toHaveBeenCalled();
  });

  it("pins by setting pinnedAt when owned", async () => {
    const meta = {
      id: "conv-1",
      tenantId: "tenant-a",
      userId: "user-a",
      title: "Hello",
      contextJson: null,
      pinnedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    repo.findOwnedMeta.mockResolvedValue(meta);
    repo.updateOwned.mockResolvedValue({ count: 1 });
    repo.findOwned.mockResolvedValue({
      ...meta,
      pinnedAt: new Date("2026-10-16T00:00:00.000Z"),
      messages: [],
    });

    await conversationService.patch({
      tenantId: "tenant-a",
      userId: "user-a",
      id: "conv-1",
      pinned: true,
    });

    expect(repo.updateOwned).toHaveBeenCalledWith(
      "tenant-a",
      "user-a",
      "conv-1",
      expect.objectContaining({
        pinnedAt: expect.any(Date),
      }),
    );
  });
});
