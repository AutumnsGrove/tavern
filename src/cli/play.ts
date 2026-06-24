#!/usr/bin/env tsx
/**
 * CLI adapter — play Tavern in the terminal.
 *
 * Usage: pnpm play
 *
 * Reads from stdin, sends to the engine, prints narrative + forks + trace.
 * Uses local SQLite (better-sqlite3) and local KV (SRD from disk).
 */

import * as readline from "readline";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createLocalD1 } from "./local-d1";
import { createLocalKV } from "./local-kv";
import { GameStore } from "../state/store";
import { SrdLoader } from "../srd/loader";
import { CommandRegistry } from "../gateway/commands";
import { registerCommands } from "../commands";
import { handleTurn } from "../engine/turn";
import type { Fork } from "../gateway/types";
import { config } from "../config";

// ── Config ──────────────────────────────────────────────────────

const DB_PATH = join(import.meta.dirname, "../../tavern.db");
const CHAT_ID = "cli";

function loadApiKey(): string {
  // Try .dev.vars first
  const devVarsPath = join(import.meta.dirname, "../../.dev.vars");
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    const match = content.match(/OPENROUTER_API_KEY=(.+)/);
    if (match) return match[1]!.trim();
  }
  // Fall back to env var
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  return "";
}

// ── Display helpers ─────────────────────────────────────────────

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";

function printTrace(lines: string[]): void {
  if (lines.length === 0) return;
  console.log(`\n${DIM}┌─── trace ────────────────────────────────┐${RESET}`);
  for (const line of lines) {
    console.log(`${DIM}│ ${line}${RESET}`);
  }
  console.log(`${DIM}└──────────────────────────────────────────┘${RESET}`);
}

function printNarrative(text: string): void {
  console.log(`\n${text}`);
}

function printForks(forks: Fork[]): void {
  if (forks.length === 0) return;
  console.log(`\n${CYAN}${BOLD}What do you do?${RESET}`);
  for (let i = 0; i < forks.length; i++) {
    console.log(`${CYAN}  ${i + 1}. ${forks[i]!.label}${RESET}${DIM} — ${forks[i]!.detail}${RESET}`);
  }
  console.log(`${CYAN}  ${forks.length + 1}. Other${RESET}${DIM} — type anything${RESET}`);
}

function printError(msg: string): void {
  console.log(`\n${YELLOW}⚠ ${msg}${RESET}`);
}

function printWelcome(): void {
  console.log(`
${BOLD}${GREEN}🍺 Welcome to the Tavern${RESET}
${DIM}A D&D-flavored choose-your-own-adventure engine${RESET}

${DIM}Type /help for commands, /new to start a campaign.${RESET}
${DIM}Or just start typing to play.${RESET}
`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("No OPENROUTER_API_KEY found. Set it in .dev.vars or as an environment variable.");
    process.exit(1);
  }

  // Initialize local backends
  const db = createLocalD1(DB_PATH);
  const kv = createLocalKV();

  // Run migrations
  const migrationSql = readFileSync(
    join(import.meta.dirname, "../state/migrations/001_initial.sql"),
    "utf-8",
  );
  await db.exec(migrationSql);

  // Run migration 002 (safe to re-run: ALTER TABLE fails silently if column exists)
  try {
    const migration002 = readFileSync(
      join(import.meta.dirname, "../state/migrations/002_class_resources.sql"),
      "utf-8",
    );
    await db.exec(migration002);
  } catch { /* column already exists */ }

  const store = new GameStore(db);
  const srd = new SrdLoader(kv);

  // Register commands
  const commands = new CommandRegistry();
  registerCommands(commands, store, srd);

  // Get or create settings
  const settings = await store.getSettings(CHAT_ID);
  let model = settings.model || config.defaultModel;
  let narrationMode = (settings.narration_mode || config.defaultNarrationMode) as "verbose" | "concise";
  let tracesEnabled = !!(settings.traces_enabled ?? config.defaultTracesEnabled);

  // Track current forks for number selection
  let currentForks: Fork[] = [];

  printWelcome();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `\n${MAGENTA}> ${RESET}`,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Check if input is a fork number
    let text = input;
    const forkNum = parseInt(input, 10);
    if (forkNum >= 1 && forkNum <= currentForks.length && input === String(forkNum)) {
      text = currentForks[forkNum - 1]!.detail;
      console.log(`${DIM}→ ${text}${RESET}`);
    }

    // Check for commands
    const parsed = commands.parse(text);
    if (parsed) {
      const def = commands.get(parsed.name);
      if (!def) {
        printError(`Unknown command: /${parsed.name}. Type /help for available commands.`);
        rl.prompt();
        return;
      }

      // Check if command requires an active save
      let saveId: string | null = null;
      if (def.requiresSave) {
        const save = await store.getActiveSave(CHAT_ID);
        if (!save) {
          printError("No active campaign. Start one with /new.");
          rl.prompt();
          return;
        }
        saveId = save.save_id;
      }

      // Special handling for mode commands that update local state
      if (parsed.name === "concise") narrationMode = "concise";
      if (parsed.name === "verbose") narrationMode = "verbose";
      if (parsed.name === "traces") tracesEnabled = !tracesEnabled;

      const result = await def.handler({ chatId: CHAT_ID, saveId, args: parsed.args });
      console.log(`\n${result.text}`);
      rl.prompt();
      return;
    }

    // Regular game input — send to the narrator
    const save = await store.getActiveSave(CHAT_ID);
    if (!save) {
      printError("No active campaign. Start one with /new.");
      rl.prompt();
      return;
    }

    console.log(`${DIM}⏳ The narrator is thinking...${RESET}`);

    try {
      const result = await handleTurn(
        { store, srd, apiKey, model },
        { chatId: CHAT_ID, saveId: save.save_id, text, narrationMode },
      );

      if (tracesEnabled) {
        printTrace(result.traceLines);
      }

      printNarrative(result.reply);
      currentForks = result.forks;
      printForks(result.forks);

      if (result.error) {
        printError(result.error);
      }
    } catch (err) {
      printError(`Engine error: ${err instanceof Error ? err.message : String(err)}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log(`\n${DIM}The tavern door closes behind you.${RESET}\n`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
