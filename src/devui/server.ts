#!/usr/bin/env tsx
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { createLocalD1 } from "../cli/local-d1";
import { createLocalKV } from "../cli/local-kv";
import { GameStore } from "../state/store";
import { SrdLoader } from "../srd/loader";
import { CommandRegistry } from "../gateway/commands";
import { registerCommands } from "../commands";
import { dispatch } from "../gateway/dispatch";
import type { DispatchDeps } from "../gateway/dispatch";
import { config } from "../config";
import { renderCharacterSheet, renderWorldState } from "../state/documents";
import { WebAdapter } from "./adapter";

const PORT = 7777;
const DB_PATH = join(import.meta.dirname, "../../tavern.db");
const CHAT_ID = "devui";

let sessionCost = 0;
let sessionTurns = 0;

function loadApiKey(): string {
  const devVarsPath = join(import.meta.dirname, "../../.dev.vars");
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    const match = content.match(/OPENROUTER_API_KEY=(.+)/);
    if (match) return match[1]!.trim();
  }
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  return "";
}

async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("No OPENROUTER_API_KEY found. Set it in .dev.vars or as an env var.");
    process.exit(1);
  }

  const db = createLocalD1(DB_PATH);
  const kv = createLocalKV();

  const migrationSql = readFileSync(
    join(import.meta.dirname, "../state/migrations/001_initial.sql"),
    "utf-8",
  );
  await db.exec(migrationSql);

  try {
    const migration002 = readFileSync(
      join(import.meta.dirname, "../state/migrations/002_class_resources.sql"),
      "utf-8",
    );
    await db.exec(migration002);
  } catch { /* column already exists */ }

  const store = new GameStore(db);
  const srd = new SrdLoader(kv);
  const commands = new CommandRegistry();
  registerCommands(commands, store, srd);
  const adapter = new WebAdapter();

  const deps: DispatchDeps = { store, srd, commands, apiKey };

  // ── Vite dev middleware ──────────────────────────────────────
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: import.meta.dirname,
    server: { middlewareMode: true, hmr: { server: undefined as unknown as ReturnType<typeof createHttpServer> } },
    appType: "spa",
  });

  const server = createHttpServer((req, res) => {
    vite.middlewares(req, res);
  });

  // Wire Vite HMR WebSocket to our HTTP server
  vite.config.server.hmr = { server };

  // ── Game WebSocket ──────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws) => {
    adapter.attach(ws);
    console.log("  ↳ client connected");

    await pushChatHistory(store, adapter);
    await pushPanelData(store, srd, adapter);

    ws.on("message", async (raw) => {
      let payload: { type: string; text?: string; data?: string; audio?: string };
      try {
        payload = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (payload.type === "message" && payload.text) {
        await handleInput(payload.text, deps, adapter, apiKey);
      } else if (payload.type === "callback" && payload.data) {
        if (payload.data === "__other__") {
          adapter.send(CHAT_ID, { text: "Type your action:" });
          return;
        }
        await handleInput(payload.data, deps, adapter, apiKey);
      } else if (payload.type === "voice" && payload.audio) {
        const text = await transcribeVoice(payload.audio, adapter, apiKey);
        if (text) {
          await handleInput(text, deps, adapter, apiKey);
        }
      } else if (payload.type === "panel_request") {
        await pushPanelData(store, srd, adapter);
      }
    });

    ws.on("close", () => {
      adapter.detach();
      console.log("  ↳ client disconnected");
    });
  });

  server.listen(PORT, () => {
    console.log(`\n  🍺 Tavern Dev UI — http://localhost:${PORT}\n`);
  });
}

async function handleInput(
  text: string,
  deps: DispatchDeps,
  adapter: WebAdapter,
  apiKey: string,
): Promise<void> {
  const settings = await deps.store.getSettings(CHAT_ID);
  const tracesEnabled = !!(settings.traces_enabled ?? config.defaultTracesEnabled);

  const isCommand = text.startsWith("/");
  const isStreaming = !isCommand;

  const stopTyping = isStreaming ? adapter.startTyping(CHAT_ID) : () => {};
  if (isStreaming) adapter.emit({ type: "stream_start" });

  try {
    const result = await dispatch(deps, CHAT_ID, text, {
      stream: isStreaming,
      onContentDelta: isStreaming ? (delta) => adapter.emit({ type: "stream_delta", text: delta }) : undefined,
      onTrace: (tracesEnabled && isStreaming) ? (line) => adapter.emit({ type: "trace_line", text: line }) : undefined,
    });

    stopTyping();

    if (result.kind === "narrative") {
      let turnCost = result.cost ?? 0;
      if (turnCost === 0) {
        const model = settings.model || config.defaultModel;
        const pricing = config.modelPricing[model];
        if (pricing && result.tokensIn && result.tokensOut) {
          turnCost = (result.tokensIn / 1_000_000) * pricing.input
                   + (result.tokensOut / 1_000_000) * pricing.output;
        }
      }
      sessionCost += turnCost;
      sessionTurns++;

      if (tracesEnabled && result.traceLines && result.traceLines.length > 0) {
        adapter.emit({ type: "trace", text: result.traceLines.join("\n") });
      }

      adapter.emit({ type: "stream_end", text: result.text, forks: result.forks });
      adapter.emit({ type: "session_stats", cost: sessionCost, turns: sessionTurns });

      pushPanelData(deps.store, deps.srd, adapter).catch(() => {});

      if (result.error) {
        await adapter.send(CHAT_ID, { text: result.error, isError: true });
      }
    } else {
      if (isStreaming) adapter.emit({ type: "stream_end", text: "", forks: [] });
      await adapter.send(CHAT_ID, {
        text: result.text,
        forks: result.forks,
        isError: result.kind === "error",
      });

      if (result.kind === "command" || result.kind === "onboarding") {
        pushPanelData(deps.store, deps.srd, adapter).catch(() => {});
      }

      if (result.kind === "command") {
        pushChatHistory(deps.store, adapter).catch(() => {});
      }
    }
  } catch (err) {
    stopTyping();
    if (isStreaming) adapter.emit({ type: "stream_end", text: "", forks: [] });
    await adapter.send(CHAT_ID, {
      text: `Engine error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    });
  }
}

async function transcribeVoice(
  audioBase64: string,
  adapter: WebAdapter,
  apiKey: string,
): Promise<string> {
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/webm" }), "voice.webm");
    formData.append("model", config.sttModel);

    const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    const json = (await res.json()) as { text?: string };
    if (!json.text) {
      await adapter.send(CHAT_ID, { text: "Couldn't transcribe voice.", isError: true });
      return "";
    }

    await adapter.sendTrace(CHAT_ID, `🎤 Voice: "${json.text}"`);
    return json.text;
  } catch (err) {
    await adapter.send(CHAT_ID, {
      text: `Voice error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    });
    return "";
  }
}

async function pushChatHistory(
  store: GameStore,
  adapter: WebAdapter,
): Promise<void> {
  const save = await store.getActiveSave(CHAT_ID);
  if (!save) {
    adapter.emit({ type: "chat_history", messages: [] });
    return;
  }

  const messages = await store.getRecentMessages(save.save_id, 50);
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  adapter.emit({ type: "chat_history", messages: history });
}

async function pushPanelData(
  store: GameStore,
  srd: SrdLoader,
  adapter: WebAdapter,
): Promise<void> {
  const save = await store.getActiveSave(CHAT_ID);
  if (!save) {
    adapter.emit({ type: "panel_data", panels: {} });
    return;
  }
  const saveId = save.save_id;

  const character = await store.getCharacter(saveId);
  const inventory = await store.getInventory(saveId);
  const npcs = await store.getNpcs(saveId);
  const flags = await store.getFlags(saveId);
  const scenes = await store.getScenes(saveId);
  const currentScene = await store.getDocument(saveId, "scene");

  const panels: Record<string, string> = {};

  if (character) {
    panels.sheet = renderCharacterSheet(character, inventory);
  }

  if (inventory.length > 0) {
    const lines = inventory.map((i) => {
      let line = `- **${i.name}**`;
      if (i.qty > 1) line += ` (x${i.qty})`;
      if (i.notes) line += ` — ${i.notes}`;
      return line;
    });
    panels.inventory = lines.join("\n");
  } else {
    panels.inventory = "Your pockets are empty.";
  }

  panels.world = renderWorldState(npcs, flags, scenes, currentScene ?? undefined);

  adapter.emit({ type: "panel_data", panels });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
