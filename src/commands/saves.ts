import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";

export function savesCommand(store: GameStore): CommandDef {
  return {
    name: "saves",
    description: "List campaigns or switch to one",
    requiresSave: false,
    handler: async (ctx) => {
      const saves = await store.listSaves(ctx.chatId);

      if (saves.length === 0) {
        return { text: "No campaigns found. Start one with /new." };
      }

      const arg = ctx.args.trim();

      // Switch to a save by number: /saves 2
      if (arg) {
        const num = parseInt(arg, 10);
        if (num >= 1 && num <= saves.length) {
          const target = saves[num - 1]!;
          await store.activateSave(target.save_id);
          const char = await store.getCharacter(target.save_id);
          const charName = char?.name ?? "Unknown";
          return {
            text: `🔄 Switched to **${target.name ?? "Untitled"}** (${charName} — Lv${char?.level ?? "?"} ${char?.race ?? ""} ${char?.class ?? ""})`,
          };
        }
        return { text: `Invalid save number. You have ${saves.length} campaign(s).` };
      }

      // List all saves
      const active = await store.getActiveSave(ctx.chatId);
      const lines: string[] = ["📜 **Your Campaigns**\n"];

      for (let i = 0; i < saves.length; i++) {
        const s = saves[i]!;
        const char = await store.getCharacter(s.save_id);
        const marker = s.save_id === active?.save_id ? " ◀ active" : "";
        const charInfo = char
          ? `${char.name} — Lv${char.level} ${char.race} ${char.class} (${char.hp_current}/${char.hp_max} HP)`
          : "No character";
        const msgCount = await store.getMessageCount(s.save_id);
        lines.push(`  **${i + 1}.** ${s.name ?? "Untitled"} — ${charInfo} · ${msgCount} turns${marker}`);
      }

      lines.push(`\nSwitch with \`/saves <number>\``);

      const forks = saves
        .filter((s) => s.save_id !== active?.save_id)
        .slice(0, 4)
        .map((s, i) => {
          const idx = saves.indexOf(s) + 1;
          return { label: `${s.name ?? `Save ${idx}`}`, detail: `/saves ${idx}` };
        });

      return { text: lines.join("\n"), forks: forks.length > 0 ? forks : undefined };
    },
  };
}
