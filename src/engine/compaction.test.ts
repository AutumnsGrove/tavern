import { describe, it, expect } from "vitest";
import { compactIfNeeded } from "./compaction";
import type { ChatMessage } from "../narrator/client";

describe("compaction", () => {
  describe("compactIfNeeded", () => {
    it("does nothing when under budget", async () => {
      const dbMessages = [
        { seq: 1, role: "user", content: "Hello", tool_calls_json: null, tool_call_id: null },
        { seq: 2, role: "assistant", content: "Hi there", tool_calls_json: null, tool_call_id: null },
      ];

      const store = {
        getRecentMessages: async () => dbMessages,
      } as any;

      const result = await compactIfNeeded(store, "save-1", []);
      expect(result.trimmedCount).toBe(0);
      expect(result.reason).toBe("none");
    });

    it("trims oldest messages when over budget", async () => {
      // Build messages that exceed budget (~12000 tokens = ~48000 chars)
      const dbMessages: Array<{ seq: number; role: string; content: string; tool_calls_json: null; tool_call_id: null }> = [];
      for (let i = 0; i < 50; i++) {
        dbMessages.push({
          seq: i + 1,
          role: i % 2 === 0 ? "user" : "assistant",
          content: "X".repeat(1500),
          tool_calls_json: null,
          tool_call_id: null,
        });
      }

      let deletedBefore: number | null = null;
      const store = {
        getRecentMessages: async () => dbMessages,
        deleteMessagesBeforeSeq: async (_saveId: string, seq: number) => {
          deletedBefore = seq;
        },
      } as any;

      const result = await compactIfNeeded(store, "save-1", []);
      expect(result.trimmedCount).toBeGreaterThan(0);
      expect(result.reason).toBe("token_budget");
      expect(deletedBefore).toBeGreaterThan(0);
    });
  });
});
