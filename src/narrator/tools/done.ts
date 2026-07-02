import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "done",
    description:
      "Signal that this turn is complete. Call this after you have narrated " +
      "the scene (via the reply tool) and presented forks.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
