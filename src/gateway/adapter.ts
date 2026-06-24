/**
 * Adapter interface. Each platform (Telegram, local dev, sim)
 * implements this to plug into the gateway.
 */

import type { InboundMsg, OutboundMsg, Fork, CapSet } from "./types";

export interface Adapter {
  name: string;
  capabilities: CapSet;

  /** Send the narrative response to the player. */
  send(chatId: string, msg: OutboundMsg): Promise<void>;

  /** Send fork buttons (inline keyboard). */
  sendForks(chatId: string, forks: Fork[]): Promise<void>;

  /** Send or update the trace message. */
  sendTrace(chatId: string, text: string): Promise<void>;

  /** Show a typing indicator. Returns a stop function. */
  startTyping(chatId: string): () => void;
}
