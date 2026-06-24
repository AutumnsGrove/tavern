import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "end_scene",
    description:
      "Declare a scene transition. Provide a summary of what happened in this scene. " +
      "The engine stores the summary and compacts old messages.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence summary of what happened in this scene" },
      },
      required: ["summary"],
    },
  },
};
