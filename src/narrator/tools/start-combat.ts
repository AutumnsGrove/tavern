import type { ToolDef } from "../client";

export const definition: ToolDef = {
  type: "function",
  function: {
    name: "start_combat",
    description:
      "Start a combat encounter. Provide enemy names — the engine looks up " +
      "stat blocks from the SRD. For custom enemies not in the SRD, provide stats.",
    parameters: {
      type: "object",
      properties: {
        enemies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Enemy name (checked against SRD bestiary)" },
              count: { type: "number", description: "How many of this enemy (default 1)" },
              custom_stats: {
                type: "object",
                properties: {
                  ac: { type: "number" },
                  hp: { type: "number" },
                  initiative_mod: { type: "number" },
                },
                description: "Only needed for enemies NOT in the SRD",
              },
            },
            required: ["name"],
          },
        },
      },
      required: ["enemies"],
    },
  },
};
