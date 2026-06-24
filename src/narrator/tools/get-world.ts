import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "get_world",
    description: "Read the full world state. Returns NPCs, flags, scenes, and current scene.",
    parameters: { type: "object", properties: {} },
  },
};
