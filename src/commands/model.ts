/**
 * /model command — switch the narrator model.
 *
 * Shows available models from config with their tier labels.
 * Usage: /model         (list all)
 *        /model 2       (pick by number)
 *        /model mimo    (fuzzy match by label)
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import { config } from "../config";

export function modelCommand(store: GameStore): CommandDef {
  return {
    name: "model",
    description: "Switch narrator model",
    requiresSave: false,
    handler: async (ctx) => {
      const models = config.availableModels;
      const settings = await store.getSettings(ctx.chatId);
      const current = settings.model || config.defaultModel;

      // No args — show the list
      if (!ctx.args.trim()) {
        const lines = models.map((m, i) => {
          const marker = m.id === current ? " ◀" : "";
          return `  ${i + 1}. **${m.label}** (${m.tier})${marker}`;
        });
        return {
          text: `🤖 **Current model:** ${models.find((m) => m.id === current)?.label ?? current}\n\n${lines.join("\n")}\n\nUse \`/model <number>\` or \`/model <name>\` to switch.`,
        };
      }

      const arg = ctx.args.trim();

      // Try number selection
      const num = parseInt(arg, 10);
      if (num >= 1 && num <= models.length && arg === String(num)) {
        const picked = models[num - 1]!;
        await store.updateSettings(ctx.chatId, { model: picked.id });
        return { text: `🤖 Switched to **${picked.label}** (${picked.tier}). Takes effect next turn.` };
      }

      // Fuzzy match by label or id
      const lower = arg.toLowerCase();
      const match = models.find(
        (m) =>
          m.label.toLowerCase().includes(lower) ||
          m.id.toLowerCase().includes(lower),
      );

      if (match) {
        await store.updateSettings(ctx.chatId, { model: match.id });
        return { text: `🤖 Switched to **${match.label}** (${match.tier}). Takes effect next turn.` };
      }

      return { text: `❓ No model matching "${arg}". Use /model to see the list.` };
    },
  };
}
