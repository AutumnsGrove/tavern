import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "update_character",
    description:
      "Update the character's state. Use for HP changes, resource spending (ki, rage, sorcery points, spell slots, etc.), " +
      "adding/removing inventory items, stat changes, etc.",
    parameters: {
      type: "object",
      properties: {
        hp_change: { type: "number", description: "Change to current HP (negative for damage, positive for healing)" },
        ki_change: { type: "number", description: "Change to current ki (negative for spending, positive for restoring). DEPRECATED: use spend_resource instead." },
        spend_resource: {
          type: "object",
          properties: {
            key: { type: "string", description: "Resource key: ki_points, rage_count, sorcery_points, action_surges, channel_divinity_charges, spell_slot_1 through spell_slot_9, etc." },
            amount: { type: "number", description: "Amount to spend (positive number). Defaults to 1." },
          },
          required: ["key"],
          description: "Spend a class resource. The engine validates availability.",
        },
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
