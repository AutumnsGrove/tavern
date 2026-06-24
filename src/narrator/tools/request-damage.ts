import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "request_damage",
    description:
      "Request a damage roll after a successful attack. Specify the damage dice notation.",
    parameters: {
      type: "object",
      properties: {
        dice: { type: "string", description: "Damage dice notation (e.g. '1d6', '2d6', '1d8')" },
        reason: { type: "string", description: "What caused the damage (e.g. 'unarmed strike', 'longsword')" },
      },
      required: ["dice", "reason"],
    },
  },
};
