/**
 * /reset command — clear hot context while keeping progress.
 *
 * Deletes all messages but preserves character, inventory, flags,
 * NPCs, scenes, and documents. Useful when the context has drifted
 * or the narrator is confused.
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";

export function resetCommand(store: GameStore): CommandDef {
  return {
    name: "reset",
    description: "Clear conversation context, keep progress",
    requiresSave: true,
    handler: async (ctx) => {
      const saveId = ctx.saveId!;

      const count = await store.getMessageCount(saveId);
      if (count === 0) {
        return { text: "🔄 Context is already empty." };
      }

      // Delete all messages for this save
      await store.deleteMessagesAfterSeq(saveId, 0);

      return {
        text: `🔄 **Context reset.** Cleared ${count} messages.\n\nYour character, inventory, world state, and scene history are intact. The narrator starts fresh — just type to continue.`,
      };
    },
  };
}
