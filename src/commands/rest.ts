/**
 * /rest command — short or long rest to restore resources.
 *
 * Usage: /rest short  (or just /rest s)
 *        /rest long   (or just /rest l, or just /rest)
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import { restoreResources, getResourceLabel } from "../resolver/resources";
import type { ResourceMap } from "../resolver/resources";
import { renderCharacterSheet } from "../state/documents";

export function restCommand(store: GameStore): CommandDef {
  return {
    name: "rest",
    description: "Take a short or long rest",
    requiresSave: true,
    handler: async (ctx) => {
      const saveId = ctx.saveId!;
      const char = await store.getCharacter(saveId);
      if (!char) return { text: "No character found." };

      const arg = ctx.args.trim().toLowerCase();
      const restType: "short" | "long" =
        arg.startsWith("s") ? "short" : "long";

      const resources: ResourceMap = JSON.parse(char.class_resources_json || "{}");
      const restored = restoreResources(resources, restType);

      // On long rest, also restore HP and hit dice
      const patch: Record<string, unknown> = {
        class_resources_json: JSON.stringify(resources),
      };

      if (restType === "long") {
        if (char.hp_current < char.hp_max) {
          patch.hp_current = char.hp_max;
          restored.push("HP");
        }
        if (char.hit_dice_remaining !== null && char.hit_dice_remaining < char.level) {
          const regain = Math.max(1, Math.floor(char.level / 2));
          patch.hit_dice_remaining = Math.min(char.level, char.hit_dice_remaining + regain);
          restored.push("Hit Dice");
        }
      } else {
        // Short rest: can spend hit dice to heal (simplified: auto-heal a bit)
        // In practice the model would handle this via narrative, but we restore resources
      }

      await store.updateCharacter(saveId, patch);

      // Re-render character sheet
      const updatedChar = await store.getCharacter(saveId);
      const inv = await store.getInventory(saveId);
      if (updatedChar) {
        await store.setDocument(saveId, "character", renderCharacterSheet(updatedChar, inv));
      }

      if (restored.length === 0) {
        return { text: `🛏️ **${restType === "long" ? "Long" : "Short"} rest.** Everything was already full.` };
      }

      return {
        text: `🛏️ **${restType === "long" ? "Long" : "Short"} rest complete.**\n\nRestored: ${restored.join(", ")}`,
      };
    },
  };
}
