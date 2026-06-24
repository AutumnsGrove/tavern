import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "request_roll",
    description:
      "Request a dice roll. The engine resolves everything — you NEVER provide " +
      "modifier values. Specify the skill or ability name, and optionally a DC. " +
      "The engine looks up the modifier from the character sheet and rolls the die. " +
      "Wait for the result before narrating the outcome.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["check", "save", "attack", "initiative", "custom"],
          description: "The type of roll",
        },
        skill: {
          type: "string",
          description:
            "The skill name for checks (e.g. 'stealth', 'persuasion', 'athletics'). " +
            "Use this for ability checks tied to a skill.",
        },
        ability: {
          type: "string",
          enum: ["str", "dex", "con", "int", "wis", "cha"],
          description: "The ability for saves or raw ability checks (no skill)",
        },
        weapon: {
          type: "string",
          description: "Weapon name for attack rolls (e.g. 'unarmed', 'quarterstaff')",
        },
        dc: {
          type: "number",
          description: "The difficulty class. You set this based on narrative difficulty.",
        },
        advantage: { type: "boolean", description: "Roll with advantage (roll 2d20, take higher)" },
        disadvantage: { type: "boolean", description: "Roll with disadvantage (roll 2d20, take lower)" },
        reason: {
          type: "string",
          description: "Brief description of what this roll is for (shown in traces)",
        },
      },
      required: ["type", "reason"],
    },
  },
};
