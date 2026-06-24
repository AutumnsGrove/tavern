/**
 * Telegram Bot API client. Thin wrapper over fetch — no dependencies.
 * Each method maps 1:1 to a Bot API endpoint.
 */

import type {
  TgSendMessageParams,
  TgEditMessageParams,
  TgFile,
  TgInlineKeyboardMarkup,
  TgMessage,
} from "./types";

export class TelegramApi {
  private baseUrl: string;

  constructor(private token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json<{ ok: boolean; result: T; description?: string }>();
    if (!json.ok) {
      throw new Error(`Telegram API ${method}: ${json.description ?? "unknown error"}`);
    }
    return json.result;
  }

  async sendMessage(params: TgSendMessageParams): Promise<TgMessage> {
    return this.call<TgMessage>("sendMessage", params as unknown as Record<string, unknown>);
  }

  async editMessageText(params: TgEditMessageParams): Promise<TgMessage | true> {
    return this.call<TgMessage | true>("editMessageText", params as unknown as Record<string, unknown>);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async sendChatAction(chatId: number | string, action: "typing"): Promise<boolean> {
    return this.call<boolean>("sendChatAction", {
      chat_id: chatId,
      action,
    });
  }

  async getFile(fileId: string): Promise<TgFile> {
    return this.call<TgFile>("getFile", { file_id: fileId });
  }

  fileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.token}/${filePath}`;
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const file = await this.getFile(fileId);
    if (!file.file_path) throw new Error("Telegram returned no file_path");
    const res = await fetch(this.fileUrl(file.file_path));
    return res.arrayBuffer();
  }

  async setWebhook(url: string): Promise<boolean> {
    return this.call<boolean>("setWebhook", { url });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.call<boolean>("deleteWebhook", {});
  }
}
