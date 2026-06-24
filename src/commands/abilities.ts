import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";
import { abilityModifier, proficiencyBonus } from "../resolver/skills";

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function abilitiesCommand(store: GameStore, srd: SrdLoader): CommandDef {
  return {
    name: "abilities",
    description: "Class features & spells for your level",
    requiresSave: true,
    handler: async (ctx) => {
      const char = await store.getCharacter(ctx.saveId!);
      if (!char) return { text: "No character found. Start a campaign with /new." };

      const combat = await store.getCombat(ctx.saveId!);
      const inCombat = combat !== null && combat.state === "active";

      const prof = proficiencyBonus(char.level);
      const dexMod = abilityModifier(char.dex);
      const strMod = abilityModifier(char.str);
      const attackMod = Math.max(dexMod, strMod) + prof;

      const lines: string[] = [];

      if (inCombat) {
        lines.push(`⚔️ **COMBAT ACTIONS — ${char.name} (${char.class} ${char.level})**`);
      } else {
        lines.push(`📋 **ABILITIES — ${char.name} (${char.class} ${char.level})**`);
      }

      // Class resources
      if (char.ki_current !== null && char.ki_max !== null) {
        lines.push(`Ki: ${char.ki_current}/${char.ki_max}`);
      }
      lines.push("");

      // Load class level data from SRD
      const levelData = await srd.classLevel<{
        level: number;
        features: Array<{ index: string; name: string }>;
        class_specific?: Record<string, unknown>;
      }>(char.class.toLowerCase(), char.level);

      // Load all features up to current level
      const features = await srd.classFeaturesUpToLevel(
        char.class.toLowerCase(),
        char.level,
      ) as Array<{ name: string; desc?: string[]; index?: string }>;

      if (inCombat) {
        // Combat-focused view
        lines.push("**ATTACKS:**");
        lines.push(`• Unarmed Strike — ${sign(attackMod)} to hit`);

        // Check for martial arts die from class_specific
        const martialArts = levelData?.class_specific?.martial_arts as
          { dice_count: number; dice_value: number } | undefined;
        if (martialArts) {
          lines.push(`  Damage: ${martialArts.dice_count}d${martialArts.dice_value}${sign(Math.max(dexMod, strMod))}`);
        }

        lines.push("");

        // Ki-powered abilities
        const kiFeatures = features.filter(
          (f) => f.desc?.some((d) => d.toLowerCase().includes("ki")) ?? false,
        );
        if (kiFeatures.length > 0) {
          lines.push("**KI ABILITIES:**");
          for (const f of kiFeatures) {
            const desc = f.desc?.[0]?.slice(0, 80) ?? "";
            lines.push(`• ${f.name} — ${desc}${desc.length >= 80 ? "..." : ""}`);
          }
          lines.push("");
        }

        // Reactions
        const reactions = features.filter(
          (f) => f.name.toLowerCase().includes("deflect") || f.name.toLowerCase().includes("reaction"),
        );
        if (reactions.length > 0) {
          lines.push("**REACTIONS:**");
          for (const f of reactions) {
            lines.push(`• ${f.name}`);
          }
          lines.push("");
        }
      } else {
        // Exploration view — all features
        lines.push("**CLASS FEATURES:**");
        for (const f of features) {
          lines.push(`• **${f.name}**`);
          if (f.desc && f.desc.length > 0) {
            const summary = f.desc[0]!.slice(0, 100);
            lines.push(`  ${summary}${summary.length >= 100 ? "..." : ""}`);
          }
        }
      }

      lines.push(`\nSpeed: ${char.speed} ft · AC: ${char.ac} · Prof: ${sign(prof)}`);

      return { text: lines.join("\n") };
    },
  };
}
