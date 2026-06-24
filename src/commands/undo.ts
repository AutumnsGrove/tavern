/**
 * /undo command — revert the last turn.
 *
 * Takes a snapshot before each turn (stored in DO memory for now).
 * /undo reverts character state and deletes the last message pair.
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";

export interface TurnSnapshot {
  character: Record<string, unknown>;
  inventory: Array<{ id: number; name: string; qty: number; unit: string | null; equipped: number; notes: string | null; category: string | null }>;
  flags: Array<{ save_id: string; key: string; value: string }>;
  messageSeq: number;
}

let lastSnapshot: TurnSnapshot | null = null;

export function setSnapshot(snapshot: TurnSnapshot): void {
  lastSnapshot = snapshot;
}

export function getSnapshot(): TurnSnapshot | null {
  return lastSnapshot;
}

export function clearSnapshot(): void {
  lastSnapshot = null;
}

export function undoCommand(store: GameStore): CommandDef {
  return {
    name: "undo",
    description: "Undo the last turn",
    requiresSave: true,
    handler: async (ctx) => {
      if (!lastSnapshot) {
        return { text: "↩️ Nothing to undo. The /undo command reverts your most recent turn." };
      }

      const saveId = ctx.saveId!;
      const snap = lastSnapshot;

      // Restore character stats
      await store.updateCharacter(saveId, snap.character);

      // Restore inventory: delete all current, re-insert snapshot
      const currentInv = await store.getInventory(saveId);
      for (const item of currentInv) {
        await store.removeItem(item.id);
      }
      for (const item of snap.inventory) {
        await store.addItem(saveId, {
          name: item.name,
          qty: item.qty,
          unit: item.unit ?? undefined,
          equipped: !!item.equipped,
          notes: item.notes ?? undefined,
          category: item.category ?? undefined,
        });
      }

      // Restore flags: delete all current, re-insert snapshot
      const currentFlags = await store.getFlags(saveId);
      for (const flag of currentFlags) {
        await store.deleteFlag(saveId, flag.key);
      }
      for (const flag of snap.flags) {
        await store.setFlag(saveId, flag.key, flag.value);
      }

      // Delete messages after the snapshot point
      await store.deleteMessagesAfterSeq(saveId, snap.messageSeq);

      // Re-render documents
      const char = await store.getCharacter(saveId);
      const inv = await store.getInventory(saveId);
      if (char) {
        const { renderCharacterSheet } = await import("../state/documents");
        await store.setDocument(saveId, "character", renderCharacterSheet(char, inv));
      }

      const npcs = await store.getNpcs(saveId);
      const flags = await store.getFlags(saveId);
      const scenes = await store.getScenes(saveId);
      const sceneDoc = await store.getDocument(saveId, "scene");
      const { renderWorldState } = await import("../state/documents");
      await store.setDocument(saveId, "world", renderWorldState(npcs, flags, scenes, sceneDoc ?? undefined));

      lastSnapshot = null;

      return { text: "↩️ **Turn undone.** Character and world state reverted to before last turn." };
    },
  };
}
