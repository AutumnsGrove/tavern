import type { WebSocket } from "ws";
import type { Adapter } from "../gateway/adapter";
import type { OutboundMsg, Fork, CapSet } from "../gateway/types";

export class WebAdapter implements Adapter {
  name = "devui";
  capabilities: CapSet = {
    inlineKeyboard: true,
    messageEdit: true,
    streaming: true,
    voice: true,
    typing: true,
  };

  private ws: WebSocket | null = null;

  attach(ws: WebSocket): void {
    this.ws = ws;
  }

  detach(): void {
    this.ws = null;
  }

  emit(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async send(chatId: string, msg: OutboundMsg): Promise<void> {
    this.emit({
      type: msg.isError ? "error" : "narrative",
      text: msg.text,
      forks: msg.forks,
    });
  }

  async sendForks(chatId: string, forks: Fork[]): Promise<void> {
    this.emit({ type: "forks", forks });
  }

  async sendTrace(chatId: string, text: string): Promise<void> {
    this.emit({ type: "trace", text });
  }

  startTyping(chatId: string): () => void {
    this.emit({ type: "typing", active: true });
    return () => this.emit({ type: "typing", active: false });
  }

  clearTraceMessage(_chatId: string): void {
    // No-op
  }
}
