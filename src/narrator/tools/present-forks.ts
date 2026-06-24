import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "present_forks",
    description:
      "Present 3-5 choice options to the player. Each option has a short label " +
      "(for the button) and a detail (what happens if chosen). The engine " +
      "automatically appends an 'Other' option for free text input.",
    parameters: {
      type: "object",
      properties: {
        forks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short button text (max ~40 chars)" },
              detail: { type: "string", description: "What this choice means — sent as the player's input if chosen" },
            },
            required: ["label", "detail"],
          },
          minItems: 3,
          maxItems: 5,
          description: "The choice options",
        },
      },
      required: ["forks"],
    },
  },
};
