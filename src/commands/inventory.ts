import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";

export function inventoryCommand(store: GameStore): CommandDef {
  return {
    name: "inventory",
    description: "Quick inventory list",
    requiresSave: true,
    handler: async (ctx) => {
      const items = await store.getInventory(ctx.saveId!);
      if (items.length === 0) {
        return { text: "🎒 Your pockets are empty." };
      }

      const lines = items.map((item) => {
        let line = `• ${item.name}`;
        if (item.qty > 1) line += ` (x${item.qty})`;
        if (item.unit) line += ` ${item.unit}`;
        if (item.equipped) line += " ⚔️";
        if (item.notes) line += ` — ${item.notes}`;
        return line;
      });

      return { text: `🎒 **Inventory**\n${lines.join("\n")}` };
    },
  };
}
