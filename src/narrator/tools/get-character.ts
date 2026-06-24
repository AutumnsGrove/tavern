import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "get_character",
    description: "Read the full character sheet. Returns all stats, inventory, and resources.",
    parameters: { type: "object", properties: {} },
  },
};
