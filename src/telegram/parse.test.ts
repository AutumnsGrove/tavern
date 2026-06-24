import { describe, it, expect } from "vitest";
import { parseTelegramUpdate } from "./parse";
import type { TgUpdate } from "./types";

describe("parseTelegramUpdate", () => {
  it("parses a text message", () => {
    const update: TgUpdate = {
      update_id: 1,
      message: {
        message_id: 42,
        chat: { id: 12345, type: "private" },
        date: 1719200000,
        text: "I attack the goblin",
      },
    };

    const result = parseTelegramUpdate(update);
    expect(result).not.toBeNull();
    expect(result!.msg.text).toBe("I attack the goblin");
    expect(result!.msg.chatId).toBe("12345");
    expect(result!.msg.adapterName).toBe("telegram");
    expect(result!.callbackQueryId).toBeUndefined();
    expect(result!.voiceFileId).toBeUndefined();
  });

  it("parses a callback query (fork button tap)", () => {
    const update: TgUpdate = {
      update_id: 2,
      callback_query: {
        id: "cb-999",
        from: { id: 1, first_name: "Autumn" },
        message: {
          message_id: 50,
          chat: { id: 12345, type: "private" },
          date: 1719200000,
        },
        data: "Sneak through the shadows",
      },
    };

    const result = parseTelegramUpdate(update);
    expect(result).not.toBeNull();
    expect(result!.msg.text).toBe("Sneak through the shadows");
    expect(result!.msg.callbackData).toBe("Sneak through the shadows");
    expect(result!.callbackQueryId).toBe("cb-999");
  });

  it("parses a voice message", () => {
    const update: TgUpdate = {
      update_id: 3,
      message: {
        message_id: 60,
        chat: { id: 12345, type: "private" },
        date: 1719200000,
        voice: {
          file_id: "voice-file-abc",
          file_unique_id: "uniq",
          duration: 5,
        },
      },
    };

    const result = parseTelegramUpdate(update);
    expect(result).not.toBeNull();
    expect(result!.msg.text).toBe("");
    expect(result!.voiceFileId).toBe("voice-file-abc");
  });

  it("returns null for empty update", () => {
    const update: TgUpdate = { update_id: 4 };
    expect(parseTelegramUpdate(update)).toBeNull();
  });

  it("returns null for callback query without data", () => {
    const update: TgUpdate = {
      update_id: 5,
      callback_query: {
        id: "cb-111",
        from: { id: 1, first_name: "Autumn" },
        message: {
          message_id: 70,
          chat: { id: 12345, type: "private" },
          date: 1719200000,
        },
      },
    };
    expect(parseTelegramUpdate(update)).toBeNull();
  });

  it("returns null for message with no text or voice", () => {
    const update: TgUpdate = {
      update_id: 6,
      message: {
        message_id: 80,
        chat: { id: 12345, type: "private" },
        date: 1719200000,
      },
    };
    expect(parseTelegramUpdate(update)).toBeNull();
  });
});
