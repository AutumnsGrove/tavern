import type { CommandDef } from "../gateway/commands";

export const helpCommand: CommandDef = {
  name: "help",
  description: "Show available commands",
  requiresSave: false,
  handler: async () => ({
    text: `🍺 **Tavern Commands**

**Game**
/new — Start a new campaign
/sheet — Display character sheet
/world — Display world state
/inventory — Quick inventory list
/abilities — Class features & spells
/roll N — Roll a dN (e.g. /roll 20)

**Narration**
/recap — Story summary (uses tokens)
/concise — Toggle concise mode
/verbose — Toggle verbose mode

**Settings**
/model — Choose narrator model
/traces — Toggle trace messages

**Session**
/save — Explicit save
/load — Load a save slot
/undo — Rewind last turn
/reset — Clear context, keep progress
/help — This message`,
  }),
};
