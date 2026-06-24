import { describe, it, expect } from "vitest";
import { compactIfNeeded } from "./compaction";
import type { ChatMessage } from "../narrator/client";

describe("compaction", () => {
  describe("compactIfNeeded", () => {
    it("does nothing when under budget", async () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      // Mock store — shouldn't be called
      const store = {} as any;

      const result = await compactIfNeeded(store, "save-1", messages);
      expect(result.trimmedCount).toBe(0);
      expect(result.reason).toBe("none");
    });

    it("trims oldest messages when over budget", async () => {
      // Build messages that exceed budget (~12000 tokens = ~48000 chars)
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push({
          role: i % 2 === 0 ? "user" : "assistant",
          content: "X".repeat(1500), // ~375 tokens each, 50 msgs = ~18750 tokens
        });
      }

      let deletedBefore: number | null = null;
      const store = {
        deleteMessagesBeforeSeq: async (_saveId: string, seq: number) => {
          deletedBefore = seq;
        },
        getRecentMessages: async () => [],
      } as any;

      // Add seq to messages for the mock
      const messagesWithSeq = messages.map((m, i) => ({ ...m, seq: i + 1 }));

      const result = await compactIfNeeded(store, "save-1", messagesWithSeq as any);
      expect(result.trimmedCount).toBeGreaterThan(0);
      expect(result.reason).toBe("token_budget");
      expect(deletedBefore).toBeGreaterThan(0);
    });
  });
});
