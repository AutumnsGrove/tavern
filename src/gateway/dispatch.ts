/**
 * Unified dispatch — the single entry point for all adapters.
 *
 * Handles: onboarding intercept → command parse → game input.
 * Returns a structured result; the caller (adapter layer) decides
 * how to deliver it (WebSocket, Telegram API, sim collection).
 */

import type { Fork } from "./types";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";
import type { CommandRegistry } from "./commands";
import { handleTurn } from "../engine/turn";
import { config } from "../config";
import { getActiveFlow, handleOnboardingInput } from "../commands/new";

export interface DispatchDeps {
  store: GameStore;
  srd: SrdLoader;
  commands: CommandRegistry;
  apiKey: string;
}

export interface DispatchCallbacks {
  stream?: boolean;
  onContentDelta?: (delta: string) => void;
  onTrace?: (line: string) => void;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface DispatchResult {
  kind: "narrative" | "command" | "onboarding" | "error";
  text: string;
  forks?: Fork[];
  traceLines?: string[];
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  cachedTokens?: number;
  model?: string;
  iterations?: number;
  toolCalls?: ToolCallRecord[];
  error?: string;
}

/**
 * Process a player input through the full game pipeline.
 * All adapters (Telegram, DevUI, Sim) call this one function.
 */
export async function dispatch(
  deps: DispatchDeps,
  chatId: string,
  text: string,
  callbacks?: DispatchCallbacks,
): Promise<DispatchResult> {
  const { store, srd, commands } = deps;

  // 1. Onboarding intercept — if a /new flow is active, feed input there
  if (getActiveFlow(chatId) && !text.startsWith("/")) {
    try {
      const result = await handleOnboardingInput(chatId, text, store, srd);
      return { kind: "onboarding", text: result.text, forks: result.forks };
    } catch (err) {
      return {
        kind: "error",
        text: `Onboarding error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 2. Command parse
  const parsed = commands.parse(text);
  if (parsed) {
    return handleCommand(deps, chatId, parsed.name, parsed.args);
  }

  // 3. Game input — narrator turn
  return handleGameInput(deps, chatId, text, callbacks);
}

async function handleCommand(
  deps: DispatchDeps,
  chatId: string,
  name: string,
  args: string,
): Promise<DispatchResult> {
  const { store, commands } = deps;
  const def = commands.get(name);

  if (!def) {
    return { kind: "error", text: `Unknown command: /${name}. Type /help for available commands.` };
  }

  let saveId: string | null = null;
  if (def.requiresSave) {
    const save = await store.getActiveSave(chatId);
    if (!save) {
      return { kind: "error", text: "No active campaign. Start one with /new." };
    }
    saveId = save.save_id;
  }

  // Settings side-effects
  if (name === "concise" || name === "verbose") {
    await store.updateSettings(chatId, { narration_mode: name });
  }
  if (name === "traces") {
    const settings = await store.getSettings(chatId);
    await store.updateSettings(chatId, { traces_enabled: settings.traces_enabled ? 0 : 1 });
  }

  const result = await def.handler({ chatId, saveId, args });
  return { kind: "command", text: result.text, forks: result.forks };
}

async function handleGameInput(
  deps: DispatchDeps,
  chatId: string,
  text: string,
  callbacks?: DispatchCallbacks,
): Promise<DispatchResult> {
  const { store, srd, apiKey } = deps;

  const save = await store.getActiveSave(chatId);
  if (!save) {
    return { kind: "error", text: "No active campaign. Start one with /new." };
  }

  const settings = await store.getSettings(chatId);
  const model = settings.model || config.defaultModel;
  const narrationMode = (settings.narration_mode || config.defaultNarrationMode) as "verbose" | "concise";

  const result = await handleTurn(
    { store, srd, apiKey, model },
    { chatId, saveId: save.save_id, text, narrationMode },
    {
      stream: callbacks?.stream,
      onContentDelta: callbacks?.onContentDelta,
      onTrace: callbacks?.onTrace,
    },
  );

  return {
    kind: "narrative",
    text: result.reply,
    forks: result.forks,
    traceLines: result.traceLines,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    cost: result.cost,
    cachedTokens: result.cachedTokens,
    model: result.model,
    iterations: result.iterations,
    toolCalls: result.toolCalls,
    error: result.error,
  };
}
