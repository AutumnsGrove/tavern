import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "lookup_rule",
    description:
      "Look up a rule, spell, class feature, monster stat block, or condition " +
      "from the D&D 5e SRD. Use this instead of guessing mechanics.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "class", "subclass", "race", "subrace", "spell", "monster",
            "equipment", "condition", "skill", "ability_score", "feature",
            "trait", "weapon_property",
          ],
          description: "What category to look up",
        },
        name: {
          type: "string",
          description: "The index/name to look up (e.g. 'monk', 'fireball', 'goblin'). Use lowercase with hyphens.",
        },
      },
      required: ["category", "name"],
    },
  },
};
