import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import { renderCharacterSheet } from "../state/documents";

export function sheetCommand(store: GameStore): CommandDef {
  return {
    name: "sheet",
    description: "Display character sheet",
    requiresSave: true,
    handler: async (ctx) => {
      const char = await store.getCharacter(ctx.saveId!);
      if (!char) return { text: "No character found. Start a campaign with /new." };

      const inventory = await store.getInventory(ctx.saveId!);
      return { text: renderCharacterSheet(char, inventory) };
    },
  };
}
