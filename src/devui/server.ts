#!/usr/bin/env tsx
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
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
import { WebAdapter } from "./adapter";

const PORT = 7777;
const DB_PATH = join(import.meta.dirname, "../../tavern.db");
const PUBLIC_DIR = join(import.meta.dirname, "public");
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

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

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

  // ── HTTP server for static files ─────────────────────────────
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let filePath = join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(readFileSync(filePath));
  });

  // ── WebSocket ────────────────────────────────────────────────
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    adapter.attach(ws);
    console.log("  ↳ client connected");

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

  // For non-command, non-onboarding input, set up streaming
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
      // Use real cost from API, fall back to estimate
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

      if (result.error) {
        await adapter.send(CHAT_ID, { text: result.error, isError: true });
      }
    } else {
      // Command, onboarding, or error — send as regular message
      if (isStreaming) adapter.emit({ type: "stream_end", text: "", forks: [] });
      await adapter.send(CHAT_ID, {
        text: result.text,
        forks: result.forks,
        isError: result.kind === "error",
      });
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

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
