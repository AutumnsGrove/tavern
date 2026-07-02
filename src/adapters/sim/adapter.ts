/**
 * Sim adapter — headless adapter for automated testing.
 *
 * Implements the Adapter interface but doesn't send anything
 * over the wire. Instead, it collects results for the sim runner
 * to inspect and report on.
 */

import type { Adapter } from "../../gateway/adapter";
import type { OutboundMsg, Fork, CapSet } from "../../gateway/types";

export interface SimTurnResult {
  input: string;
  reply: string;
  forks: Fork[];
  traceLines: string[];
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  durationMs: number;
}

export class SimAdapter implements Adapter {
  name = "sim";
  capabilities: CapSet = {
    inlineKeyboard: false,
    messageEdit: false,
    streaming: false,
    voice: false,
    typing: false,
  };

  private replies: string[] = [];
  private forks: Fork[] = [];
  private traces: string[] = [];
  private errors: string[] = [];

  async send(_chatId: string, msg: OutboundMsg): Promise<void> {
    if (msg.isError) {
      this.errors.push(msg.text);
    } else {
      this.replies.push(msg.text);
      if (msg.forks) this.forks = msg.forks;
    }
  }

  async sendForks(_chatId: string, forks: Fork[]): Promise<void> {
    this.forks = forks;
  }

  async sendTrace(_chatId: string, text: string): Promise<void> {
    this.traces.push(text);
  }

  startTyping(_chatId: string): () => void {
    return () => {};
  }

  /** Collect everything captured this turn and reset. */
  flush(): { replies: string[]; forks: Fork[]; traces: string[]; errors: string[] } {
    const result = {
      replies: [...this.replies],
      forks: [...this.forks],
      traces: [...this.traces],
      errors: [...this.errors],
    };
    this.replies = [];
    this.forks = [];
    this.traces = [];
    this.errors = [];
    return result;
  }
}
