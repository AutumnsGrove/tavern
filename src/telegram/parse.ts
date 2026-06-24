/**
 * Parse a Telegram Update into a transport-agnostic InboundMsg.
 * Returns null if the update doesn't contain anything actionable.
 */

import type { TgUpdate } from "./types";
import type { InboundMsg } from "../gateway/types";

export interface ParsedUpdate {
  msg: InboundMsg;
  /** Set when this came from a callback_query — must be answered */
  callbackQueryId?: string;
  /** Voice file_id for download — adapter handles the actual fetch */
  voiceFileId?: string;
}

export function parseTelegramUpdate(update: TgUpdate): ParsedUpdate | null {
  // Inline keyboard button tap
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat.id;
    if (!chatId || !cb.data) return null;

    return {
      msg: {
        text: cb.data,
        chatId: String(chatId),
        adapterName: "telegram",
        timestamp: new Date(),
        callbackData: cb.data,
      },
      callbackQueryId: cb.id,
    };
  }

  // Regular message
  if (update.message) {
    const m = update.message;
    const chatId = m.chat.id;

    // Voice memo — text will be filled after STT
    if (m.voice) {
      return {
        msg: {
          text: "",
          chatId: String(chatId),
          adapterName: "telegram",
          timestamp: new Date(m.date * 1000),
        },
        voiceFileId: m.voice.file_id,
      };
    }

    // Text message
    if (m.text) {
      return {
        msg: {
          text: m.text,
          chatId: String(chatId),
          adapterName: "telegram",
          timestamp: new Date(m.date * 1000),
        },
      };
    }
  }

  return null;
}
