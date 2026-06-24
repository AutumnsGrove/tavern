import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "end_combat",
    description: "End the current combat encounter.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why combat ended (all enemies defeated, fled, surrender, etc.)" },
      },
      required: ["reason"],
    },
  },
};
