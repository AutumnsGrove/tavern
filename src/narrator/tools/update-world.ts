import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "update_world",
    description:
      "Update the world state. Use for NPC changes, flag changes, " +
      "and updating the current scene description.",
    parameters: {
      type: "object",
      properties: {
        set_flags: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Flags to set (key-value pairs)",
        },
        remove_flags: {
          type: "array",
          items: { type: "string" },
          description: "Flag keys to remove",
        },
        add_npcs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              loyalty: { type: "number" },
              notes: { type: "string" },
            },
            required: ["name"],
          },
          description: "NPCs to add",
        },
        update_npcs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "NPC name to update" },
              loyalty: { type: "number" },
              alive: { type: "boolean" },
              notes: { type: "string" },
              role: { type: "string" },
            },
            required: ["name"],
          },
          description: "NPC updates (match by name)",
        },
        current_scene: { type: "string", description: "Update the current scene description" },
      },
    },
  },
};
