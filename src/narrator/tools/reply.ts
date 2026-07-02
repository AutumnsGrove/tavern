import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "reply",
    description:
      "Send narrative prose to the player. This is the story text they read. " +
      "Write in second person ('You step into the shadows...'). " +
      "You may call this multiple times per turn — for example, narrate the " +
      "setup, request a roll, then narrate the outcome. Each call appends to " +
      "the narrative.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The narrative prose to display to the player" },
      },
      required: ["text"],
    },
  },
};
