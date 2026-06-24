import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "done",
    description:
      "Signal that this turn is complete. Call this after reply and present_forks. " +
      "The engine will reject the turn if reply was not called before done.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};
