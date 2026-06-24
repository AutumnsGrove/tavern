/**
 * Telegram adapter. Implements the gateway Adapter interface
 * so the engine can send messages without knowing about Telegram.
 */

import type { Adapter } from "../gateway/adapter";
import type { OutboundMsg, Fork, CapSet } from "../gateway/types";
import type { TgInlineKeyboardMarkup } from "./types";
import { TelegramApi } from "./api";

const MAX_MESSAGE_LENGTH = 4096;

export class TelegramAdapter implements Adapter {
  name = "telegram";
  capabilities: CapSet = {
    inlineKeyboard: true,
    messageEdit: true,
    streaming: false,
    voice: true,
    typing: true,
  };

  private api: TelegramApi;
  private traceMessageIds = new Map<string, number>();

  constructor(token: string) {
    this.api = new TelegramApi(token);
  }

  getApi(): TelegramApi {
    return this.api;
  }

  async send(chatId: string, msg: OutboundMsg): Promise<void> {
    const pages = paginate(msg.text);
    const numericId = Number(chatId);

    for (let i = 0; i < pages.length; i++) {
      const isLast = i === pages.length - 1;
      await this.api.sendMessage({
        chat_id: numericId,
        text: pages[i]!,
        parse_mode: "Markdown",
        // Attach forks to the last page only
        reply_markup: isLast && msg.forks?.length ? forksToKeyboard(msg.forks) : undefined,
      });
    }
  }

  async sendForks(chatId: string, forks: Fork[]): Promise<void> {
    await this.api.sendMessage({
      chat_id: Number(chatId),
      text: "What do you do?",
      parse_mode: "Markdown",
      reply_markup: forksToKeyboard(forks),
    });
  }

  async sendTrace(chatId: string, text: string): Promise<void> {
    const numericId = Number(chatId);
    const existing = this.traceMessageIds.get(chatId);

    if (existing) {
      try {
        await this.api.editMessageText({
          chat_id: numericId,
          message_id: existing,
          text,
          parse_mode: "Markdown",
        });
        return;
      } catch {
        // Message might be too old to edit — send new
      }
    }

    const sent = await this.api.sendMessage({
      chat_id: numericId,
      text,
      parse_mode: "Markdown",
    });
    this.traceMessageIds.set(chatId, sent.message_id);
  }

  clearTraceMessage(chatId: string): void {
    this.traceMessageIds.delete(chatId);
  }

  startTyping(chatId: string): () => void {
    const numericId = Number(chatId);
    let active = true;

    const tick = () => {
      if (!active) return;
      this.api.sendChatAction(numericId, "typing").catch(() => {});
    };

    tick();
    // Telegram typing indicator lasts ~5s, re-send every 4s
    const interval = setInterval(tick, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }
}

function forksToKeyboard(forks: Fork[]): TgInlineKeyboardMarkup {
  const buttons = forks.map((f) => [{ text: f.label, callback_data: f.detail }]);
  buttons.push([{ text: "✍️ Other", callback_data: "__other__" }]);
  return { inline_keyboard: buttons };
}

function paginate(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const pages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      pages.push(remaining);
      break;
    }

    // Try to break at a paragraph boundary
    let splitAt = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      // No good paragraph break — try single newline
      splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      // Last resort — break at space
      splitAt = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitAt <= 0) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    pages.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return pages;
}

export { paginate };
