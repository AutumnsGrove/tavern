import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import { renderWorldState } from "../state/documents";

export function worldCommand(store: GameStore): CommandDef {
  return {
    name: "world",
    description: "Display world state",
    requiresSave: true,
    handler: async (ctx) => {
      const npcs = await store.getNpcs(ctx.saveId!);
      const flags = await store.getFlags(ctx.saveId!);
      const scenes = await store.getScenes(ctx.saveId!);
      const currentScene = await store.getDocument(ctx.saveId!, "scene");
      return { text: renderWorldState(npcs, flags, scenes, currentScene ?? undefined) };
    },
  };
}
