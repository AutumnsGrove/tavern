import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "enemy_action",
    description:
      "Declare an enemy's action on their turn. The engine resolves all rolls.",
    parameters: {
      type: "object",
      properties: {
        enemy: { type: "string", description: "Which enemy is acting" },
        action: { type: "string", description: "What the enemy does (e.g. 'melee attack', 'cast spell', 'flee')" },
        target: { type: "string", description: "Who the enemy targets" },
      },
      required: ["enemy", "action", "target"],
    },
  },
};
