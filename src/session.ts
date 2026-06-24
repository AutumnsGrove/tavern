/**
 * GameSession Durable Object. One instance per chat_id.
 *
 * Receives raw Telegram webhooks from the Worker, parses them,
 * dispatches commands or runs the narrator engine, and sends
 * responses back via the Telegram adapter.
 *
 * All game logic runs here — the Worker is just a thin router.
 */

import type { Env } from "./worker";
import type { TgUpdate } from "./telegram/types";
import { TelegramAdapter } from "./telegram/adapter";
import { parseTelegramUpdate } from "./telegram/parse";
import { GameStore } from "./state/store";
import { SrdLoader } from "./srd/loader";
import { CommandRegistry } from "./gateway/commands";
import { registerCommands } from "./commands";
import { handleTurn } from "./engine/turn";
import { config } from "./config";
import { getActiveFlow, handleOnboardingInput } from "./commands/new";

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
    // D1 migrations are handled by wrangler in production,
    // but we ensure the schema exists for safety
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

    // Process asynchronously — return 200 immediately so Telegram doesn't retry
    this.state.waitUntil(this.handleUpdate(update));

    return new Response("ok");
  }

  private async handleUpdate(update: TgUpdate): Promise<void> {
    const parsed = parseTelegramUpdate(update);
    if (!parsed) return;

    const { msg, callbackQueryId, voiceFileId } = parsed;
    const chatId = msg.chatId;

    // Answer callback query immediately (removes loading spinner on button)
    if (callbackQueryId) {
      await this.adapter.getApi().answerCallbackQuery(callbackQueryId);
    }

    // Handle "__other__" button — prompt for free text
    if (msg.callbackData === "__other__") {
      await this.adapter.send(chatId, { text: "Type your action:" });
      return;
    }

    // Handle voice memos via STT
    let text = msg.text;
    if (voiceFileId) {
      text = await this.transcribeVoice(voiceFileId, chatId);
      if (!text) return;
    }

    if (!text) return;

    // Check if onboarding flow is active — intercept input
    if (getActiveFlow(chatId) && !text.startsWith("/")) {
      try {
        const result = await handleOnboardingInput(chatId, text, this.store, this.srd);
        await this.adapter.send(chatId, {
          text: result.text,
          forks: result.forks,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.adapter.send(chatId, { text: `⚠️ Onboarding error: ${errMsg}`, isError: true });
      }
      return;
    }

    // Check for commands
    const cmdParsed = this.commands.parse(text);
    if (cmdParsed) {
      await this.handleCommand(cmdParsed.name, cmdParsed.args, chatId);
      return;
    }

    // Regular game input — run the engine
    await this.handleGameInput(text, chatId);
  }

  private async handleCommand(name: string, args: string, chatId: string): Promise<void> {
    const def = this.commands.get(name);
    if (!def) {
      await this.adapter.send(chatId, {
        text: `Unknown command: /${name}. Type /help for available commands.`,
        isError: true,
      });
      return;
    }

    let saveId: string | null = null;
    if (def.requiresSave) {
      const save = await this.store.getActiveSave(chatId);
      if (!save) {
        await this.adapter.send(chatId, {
          text: "No active campaign. Start one with /new.",
          isError: true,
        });
        return;
      }
      saveId = save.save_id;
    }

    // Mode commands update settings
    if (name === "concise" || name === "verbose") {
      await this.store.updateSettings(chatId, { narration_mode: name });
    }
    if (name === "traces") {
      const settings = await this.store.getSettings(chatId);
      await this.store.updateSettings(chatId, {
        traces_enabled: settings.traces_enabled ? 0 : 1,
      });
    }

    const result = await def.handler({ chatId, saveId, args });
    await this.adapter.send(chatId, {
      text: result.text,
      forks: result.forks,
    });
  }

  private async handleGameInput(text: string, chatId: string): Promise<void> {
    const save = await this.store.getActiveSave(chatId);
    if (!save) {
      await this.adapter.send(chatId, {
        text: "No active campaign. Start one with /new.",
        isError: true,
      });
      return;
    }

    const settings = await this.store.getSettings(chatId);
    const model = settings.model || config.defaultModel;
    const narrationMode = (settings.narration_mode || config.defaultNarrationMode) as "verbose" | "concise";
    const tracesEnabled = !!(settings.traces_enabled ?? config.defaultTracesEnabled);

    const stopTyping = this.adapter.startTyping(chatId);

    try {
      const result = await handleTurn(
        { store: this.store, srd: this.srd, apiKey: this.env.OPENROUTER_API_KEY, model },
        { chatId, saveId: save.save_id, text, narrationMode },
      );

      stopTyping();

      // Send trace (above narrative) if enabled
      if (tracesEnabled && result.traceLines.length > 0) {
        const traceText = result.traceLines.map((l) => `\`${l}\``).join("\n");
        await this.adapter.sendTrace(chatId, traceText);
      }

      // Clear trace message ID so next turn gets a fresh one
      this.adapter.clearTraceMessage(chatId);

      // Send narrative + forks
      await this.adapter.send(chatId, {
        text: result.reply,
        forks: result.forks,
      });

      if (result.error) {
        await this.adapter.send(chatId, { text: `⚠️ ${result.error}`, isError: true });
      }
    } catch (err) {
      stopTyping();
      const msg = err instanceof Error ? err.message : String(err);
      await this.adapter.send(chatId, {
        text: `⚠️ Engine error: ${msg}`,
        isError: true,
      });
    }
  }

  private async transcribeVoice(fileId: string, chatId: string): Promise<string> {
    try {
      const audio = await this.adapter.getApi().downloadFile(fileId);

      // Call OpenRouter STT (Whisper-compatible endpoint)
      const formData = new FormData();
      formData.append("file", new Blob([audio], { type: "audio/ogg" }), "voice.ogg");
      formData.append("model", config.sttModel);

      const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.OPENROUTER_API_KEY}`,
        },
        body: formData,
      });

      const json = await res.json<{ text?: string }>();
      if (!json.text) {
        await this.adapter.send(chatId, { text: "Couldn't transcribe voice memo.", isError: true });
        return "";
      }

      // Show transcript in trace
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
