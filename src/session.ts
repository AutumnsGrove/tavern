/**
 * GameSession Durable Object. One instance per chat_id.
 *
 * Receives raw Telegram webhooks from the Worker, parses them,
 * and routes through the unified dispatch. The dispatch handles
 * commands, onboarding, and narrator turns — this file only
 * handles Telegram-specific I/O (voice, callbacks, typing).
 */

import type { Env } from "./worker";
import type { TgUpdate } from "./telegram/types";
import { TelegramAdapter } from "./telegram/adapter";
import { parseTelegramUpdate } from "./telegram/parse";
import { GameStore } from "./state/store";
import { SrdLoader } from "./srd/loader";
import { CommandRegistry } from "./gateway/commands";
import { registerCommands } from "./commands";
import { dispatch } from "./gateway/dispatch";
import { config } from "./config";

export class GameSession implements DurableObject {
  private env: Env;
  private adapter: TelegramAdapter;
  private store: GameStore;
  private srd: SrdLoader;
  private commands: CommandRegistry;
  private migrated = false;

  constructor(private state: DurableObjectState, env: Env) {
    this.env = env;
    this.adapter = new TelegramAdapter(env.TELEGRAM_BOT_TOKEN);
    this.store = new GameStore(env.DB);
    this.srd = new SrdLoader(env.SRD);
    this.commands = new CommandRegistry();
    registerCommands(this.commands, this.store, this.srd);
  }

  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureMigrated();

    let update: TgUpdate;
    try {
      update = await request.json<TgUpdate>();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    this.state.waitUntil(this.handleUpdate(update));
    return new Response("ok");
  }

  private async handleUpdate(update: TgUpdate): Promise<void> {
    const parsed = parseTelegramUpdate(update);
    if (!parsed) return;

    const { msg, callbackQueryId, voiceFileId } = parsed;
    const chatId = msg.chatId;

    if (callbackQueryId) {
      await this.adapter.getApi().answerCallbackQuery(callbackQueryId);
    }

    if (msg.callbackData === "__other__") {
      await this.adapter.send(chatId, { text: "Type your action:" });
      return;
    }

    let text = msg.text;
    if (voiceFileId) {
      text = await this.transcribeVoice(voiceFileId, chatId);
      if (!text) return;
    }

    if (!text) return;

    // Typing indicator while dispatch processes
    const stopTyping = this.adapter.startTyping(chatId);

    try {
      const result = await dispatch(
        { store: this.store, srd: this.srd, commands: this.commands, apiKey: this.env.OPENROUTER_API_KEY },
        chatId,
        text,
      );

      stopTyping();

      // Send trace if it's a narrative turn with traces
      if (result.kind === "narrative") {
        const settings = await this.store.getSettings(chatId);
        const tracesEnabled = !!(settings.traces_enabled ?? config.defaultTracesEnabled);
        if (tracesEnabled && result.traceLines && result.traceLines.length > 0) {
          const traceText = result.traceLines.map((l) => `\`${l}\``).join("\n");
          await this.adapter.sendTrace(chatId, traceText);
        }
        this.adapter.clearTraceMessage(chatId);
      }

      // Send response
      await this.adapter.send(chatId, {
        text: result.text,
        forks: result.forks,
        isError: result.kind === "error",
      });

      if (result.error) {
        await this.adapter.send(chatId, { text: `⚠️ ${result.error}`, isError: true });
      }
    } catch (err) {
      stopTyping();
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.adapter.send(chatId, { text: `⚠️ Engine error: ${errMsg}`, isError: true });
    }
  }

  private async transcribeVoice(fileId: string, chatId: string): Promise<string> {
    try {
      const audio = await this.adapter.getApi().downloadFile(fileId);

      const formData = new FormData();
      formData.append("file", new Blob([audio], { type: "audio/ogg" }), "voice.ogg");
      formData.append("model", config.sttModel);

      const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.env.OPENROUTER_API_KEY}` },
        body: formData,
      });

      const json = await res.json<{ text?: string }>();
      if (!json.text) {
        await this.adapter.send(chatId, { text: "Couldn't transcribe voice memo.", isError: true });
        return "";
      }

      const settings = await this.store.getSettings(chatId);
      if (settings.traces_enabled) {
        await this.adapter.sendTrace(chatId, `\`🎤 Voice: "${json.text}"\``);
      }

      return json.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.adapter.send(chatId, { text: `⚠️ Voice error: ${msg}`, isError: true });
      return "";
    }
  }
}
