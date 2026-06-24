/**
 * /abilities command — shows class features, attacks, and resources.
 *
 * Context-aware: in combat shows an action menu with attacks,
 * resource costs, and available reactions. In exploration shows
 * the full feature list.
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";
import { abilityModifier, proficiencyBonus } from "../resolver/skills";
import { getResourceLabel } from "../resolver/resources";
import type { ResourceMap } from "../resolver/resources";

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
      const wisMod = abilityModifier(char.wis);
      const chaMod = abilityModifier(char.cha);
      const intMod = abilityModifier(char.int);

      const lines: string[] = [];

      // Class resources from the generic system
      const resources: ResourceMap = JSON.parse(char.class_resources_json || "{}");
      const resourceLines: string[] = [];
      for (const [key, r] of Object.entries(resources)) {
        if (r.max > 0) {
          const label = getResourceLabel(key);
          const rest = r.restoresOn === "short" ? "SR" : "LR";
          const depleted = r.current === 0 ? " ✘" : "";
          resourceLines.push(`${label}: ${r.current}/${r.max} (${rest})${depleted}`);
        }
      }

      const classLower = char.class.toLowerCase();

      if (inCombat) {
        lines.push(`⚔️ **COMBAT ACTIONS — ${char.name}**`);
        lines.push(`*${char.race} ${char.class} ${char.level} · HP: ${char.hp_current}/${char.hp_max} · AC: ${char.ac}*`);
        lines.push("");

        if (resourceLines.length > 0) {
          lines.push("**RESOURCES:**");
          lines.push(...resourceLines);
          lines.push("");
        }

        // Attacks section
        lines.push("**ATTACKS:**");

        // Equipped weapons from inventory
        const inventory = await store.getInventory(ctx.saveId!);
        const weapons = inventory.filter((i) => i.category === "weapon" && i.equipped);
        if (weapons.length > 0) {
          for (const w of weapons) {
            // Finesse weapons use higher of STR/DEX
            const attackMod = Math.max(dexMod, strMod) + prof;
            lines.push(`• ${w.name} — ${sign(attackMod)} to hit`);
          }
        }

        // Unarmed strike (monks get martial arts die)
        const levelData = await srd.classLevel<{
          class_specific?: Record<string, unknown>;
        }>(classLower, char.level);

        const martialArts = levelData?.class_specific?.martial_arts as
          { dice_count: number; dice_value: number } | undefined;

        if (classLower === "monk" && martialArts) {
          const attackMod = Math.max(dexMod, strMod) + prof;
          lines.push(`• Unarmed Strike — ${sign(attackMod)} to hit, ${martialArts.dice_count}d${martialArts.dice_value}${sign(Math.max(dexMod, strMod))} damage`);
          lines.push(`• Flurry of Blows — 2 unarmed strikes (1 ki)`);
        } else {
          const attackMod = strMod + prof;
          lines.push(`• Unarmed Strike — ${sign(attackMod)} to hit, 1${sign(strMod)} damage`);
        }

        // Sneak attack for rogues
        const sneakAttack = levelData?.class_specific?.sneak_attack as
          { dice_count: number; dice_value: number } | undefined;
        if (sneakAttack) {
          lines.push(`• Sneak Attack — +${sneakAttack.dice_count}d${sneakAttack.dice_value} (once/turn, requires advantage or adjacent ally)`);
        }

        lines.push("");

        // Class-specific combat abilities
        const combatAbilities = getCombatAbilities(classLower, resources, char.level, {
          strMod, dexMod, wisMod, chaMod, intMod, prof,
        });
        if (combatAbilities.length > 0) {
          lines.push("**SPECIAL:**");
          lines.push(...combatAbilities);
          lines.push("");
        }

        // Spells if any spell slots exist
        const hasSpellSlots = Object.keys(resources).some((k) => k.startsWith("spell_slot_"));
        if (hasSpellSlots) {
          lines.push("**SPELL SLOTS:**");
          for (const [key, r] of Object.entries(resources)) {
            if (key.startsWith("spell_slot_") && r.max > 0) {
              lines.push(`• ${getResourceLabel(key)}: ${r.current}/${r.max}`);
            }
          }
          lines.push("*(Use your spells by describing the action — the engine handles the rest)*");
          lines.push("");
        }

        // Reactions
        const features = await srd.classFeaturesUpToLevel(classLower, char.level) as
          Array<{ name: string; desc?: string[] }>;
        const reactions = features.filter(
          (f) => f.desc?.some((d) =>
            d.toLowerCase().includes("reaction") ||
            d.toLowerCase().includes("deflect") ||
            d.toLowerCase().includes("opportunity"),
          ) ?? false,
        );
        if (reactions.length > 0) {
          lines.push("**REACTIONS:**");
          for (const f of reactions) {
            lines.push(`• ${f.name}`);
          }
        }

      } else {
        // Exploration view
        lines.push(`📋 **ABILITIES — ${char.name}**`);
        lines.push(`*${char.race} ${char.class} ${char.level}*`);
        lines.push("");

        if (resourceLines.length > 0) {
          lines.push("**RESOURCES:**");
          lines.push(...resourceLines);
          lines.push("");
        }

        const features = await srd.classFeaturesUpToLevel(classLower, char.level) as
          Array<{ name: string; desc?: string[] }>;

        lines.push("**CLASS FEATURES:**");
        for (const f of features) {
          lines.push(`• **${f.name}**`);
          if (f.desc && f.desc.length > 0) {
            const summary = f.desc[0]!.slice(0, 100);
            lines.push(`  ${summary}${summary.length >= 100 ? "..." : ""}`);
          }
        }
      }

      lines.push("");
      lines.push(`Speed: ${char.speed} ft · AC: ${char.ac} · Prof: ${sign(prof)}`);

      return { text: lines.join("\n") };
    },
  };
}

function getCombatAbilities(
  classLower: string,
  resources: ResourceMap,
  level: number,
  mods: { strMod: number; dexMod: number; wisMod: number; chaMod: number; intMod: number; prof: number },
): string[] {
  const lines: string[] = [];

  switch (classLower) {
    case "monk": {
      const ki = resources["ki_points"];
      if (ki && ki.current > 0) {
        lines.push(`• Patient Defense — dodge action (1 ki, ${ki.current} remaining)`);
        lines.push(`• Step of the Wind — dash or disengage (1 ki)`);
        if (level >= 5) lines.push(`• Stunning Strike — on hit, target CON save DC ${8 + mods.prof + mods.wisMod} or stunned (1 ki)`);
      }
      break;
    }
    case "barbarian": {
      const rage = resources["rage_count"];
      if (rage && rage.current > 0) {
        lines.push(`• Rage — advantage on STR checks/saves, +damage, resistance (${rage.current} remaining)`);
      }
      if (level >= 2) lines.push(`• Reckless Attack — advantage on attacks, enemies have advantage on you`);
      break;
    }
    case "fighter": {
      const surge = resources["action_surges"];
      if (surge && surge.current > 0) {
        lines.push(`• Action Surge — take an extra action (${surge.current} remaining)`);
      }
      lines.push(`• Second Wind — heal 1d10${sign(level)} HP (1/short rest)`);
      break;
    }
    case "rogue": {
      lines.push(`• Cunning Action — dash, disengage, or hide as bonus action`);
      if (level >= 5) lines.push(`• Uncanny Dodge — halve damage from one attack (reaction)`);
      break;
    }
    case "cleric": {
      const cd = resources["channel_divinity_charges"];
      if (cd && cd.current > 0) {
        lines.push(`• Channel Divinity — Turn Undead or domain feature (${cd.current} remaining)`);
      }
      break;
    }
    case "sorcerer": {
      const sp = resources["sorcery_points"];
      if (sp && sp.current > 0) {
        lines.push(`• Sorcery Points: ${sp.current}/${sp.max} — Metamagic or convert to spell slots`);
      }
      break;
    }
    case "paladin": {
      lines.push(`• Divine Smite — on hit, spend spell slot for +2d8 radiant (3d8 vs undead)`);
      lines.push(`• Lay on Hands — heal pool of ${level * 5} HP total`);
      break;
    }
    case "warlock": {
      lines.push(`• Eldritch Blast — ranged attack, ${sign(mods.chaMod + mods.prof)} to hit, 1d10 force`);
      break;
    }
    case "wizard":
    case "bard":
    case "druid":
    case "ranger": {
      lines.push(`• Spellcasting — see /abilities in exploration for full spell list`);
      break;
    }
  }

  return lines;
}
