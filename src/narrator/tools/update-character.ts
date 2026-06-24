import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "update_character",
    description:
      "Update the character's state. Use for HP changes, ki spending, " +
      "adding/removing inventory items, stat changes, etc.",
    parameters: {
      type: "object",
      properties: {
        hp_change: { type: "number", description: "Change to current HP (negative for damage, positive for healing)" },
        ki_change: { type: "number", description: "Change to current ki (negative for spending, positive for restoring)" },
        add_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              qty: { type: "number" },
              unit: { type: "string" },
              category: { type: "string" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
          description: "Items to add to inventory",
        },
        remove_items: {
          type: "array",
          items: { type: "string" },
          description: "Item names to remove from inventory",
        },
      },
    },
  },
};
