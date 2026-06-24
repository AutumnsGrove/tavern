import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "reply",
    description:
      "Send narrative prose to the player. This is the story text they read. " +
      "Exactly one reply per turn. Write in second person ('you').",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The narrative prose to display to the player" },
      },
      required: ["text"],
    },
  },
};
