import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";

export function conciseCommand(store: GameStore): CommandDef {
  return {
    name: "concise",
    description: "Switch to concise narration",
    requiresSave: false,
    handler: async (ctx) => {
      await store.updateSettings(ctx.chatId, { narration_mode: "concise" });
      return { text: "✏️ Switched to **concise** mode. Punchy narration, fast forks." };
    },
  };
}

export function verboseCommand(store: GameStore): CommandDef {
  return {
    name: "verbose",
    description: "Switch to verbose narration",
    requiresSave: false,
    handler: async (ctx) => {
      await store.updateSettings(ctx.chatId, { narration_mode: "verbose" });
      return { text: "✏️ Switched to **verbose** mode. Rich, atmospheric prose." };
    },
  };
}

export function tracesCommand(store: GameStore): CommandDef {
  return {
    name: "traces",
    description: "Toggle trace messages",
    requiresSave: false,
    handler: async (ctx) => {
      const settings = await store.getSettings(ctx.chatId);
      const newValue = settings.traces_enabled ? 0 : 1;
      await store.updateSettings(ctx.chatId, { traces_enabled: newValue });
      return { text: newValue ? "🔍 Traces **on** — you'll see dice rolls and state changes." : "🔍 Traces **off**." };
    },
  };
}
