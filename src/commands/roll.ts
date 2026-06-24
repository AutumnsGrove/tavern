import type { CommandDef } from "../gateway/commands";
import { rollDie } from "../resolver/dice";

export const rollCommand: CommandDef = {
  name: "roll",
  description: "Roll a die — /roll 20, /roll 6",
  requiresSave: false,
  handler: async (ctx) => {
    const sides = parseInt(ctx.args, 10);
    if (!sides || sides < 1 || sides > 100) {
      return { text: "Usage: /roll N (e.g. /roll 20, /roll 6). Max d100." };
    }

    const result = rollDie(sides);
    const crit = sides === 20 && result === 20 ? " *** NAT 20 ***" : "";
    const fumble = sides === 20 && result === 1 ? " *** NAT 1 ***" : "";

    return { text: `🎲 d${sides}: **${result}**${crit}${fumble}` };
  },
};
