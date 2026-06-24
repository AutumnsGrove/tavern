import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "think",
    description:
      "Private scratchpad for planning your narration, reasoning about the situation, " +
      "or deciding what to do next. The player never sees this. Use before complex decisions.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Your private reasoning" },
      },
      required: ["text"],
    },
  },
};
