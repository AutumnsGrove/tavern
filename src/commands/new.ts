/**
 * /new command — quick character creation.
 *
 * For the CLI, this creates a character with sensible defaults so
 * you can start playing immediately. The full interactive onboarding
 * (with inline keyboards and step-by-step choices) comes later.
 *
 * Usage: /new [name] [class] [race] [level]
 * Example: /new Sayola Monk Tiefling 10
 * Defaults: "Adventurer" Fighter Human 3
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";
import { rollAbilityScores } from "../resolver/dice";
import { abilityModifier, proficiencyBonus } from "../resolver/skills";
import { renderCharacterSheet } from "../state/documents";
import { buildResourceMap } from "../resolver/resources";
import { config } from "../config";

export function newCommand(store: GameStore, srd: SrdLoader): CommandDef {
  return {
    name: "new",
    description: "Start a new campaign",
    requiresSave: false,
    handler: async (ctx) => {
      const parts = ctx.args.split(/\s+/).filter(Boolean);
      const name = parts[0] || "Adventurer";
      const className = parts[1] || "Fighter";
      const race = parts[2] || "Human";
      const level = parseInt(parts[3] || String(config.defaultLevel), 10);

      // Roll ability scores
      const { scores, details } = rollAbilityScores();

      // Sort scores descending for smart assignment
      const sorted = [...scores].sort((a, b) => b - a);

      // Look up class to determine primary abilities
      const classData = await srd.lookup<{
        hit_die: number;
        saving_throws: Array<{ index: string }>;
      }>("class", className.toLowerCase());

      const hitDie = classData?.hit_die ?? 10;
      const saveProficiencies = classData?.saving_throws?.map(
        (s) => s.index.toLowerCase(),
      ) ?? ["str", "con"];

      // Smart stat assignment based on class
      const classStatPriority: Record<string, string[]> = {
        monk: ["dex", "wis", "con", "str", "cha", "int"],
        fighter: ["str", "con", "dex", "wis", "cha", "int"],
        rogue: ["dex", "cha", "con", "int", "wis", "str"],
        wizard: ["int", "con", "dex", "wis", "cha", "str"],
        cleric: ["wis", "con", "str", "cha", "dex", "int"],
        bard: ["cha", "dex", "con", "wis", "int", "str"],
        barbarian: ["str", "con", "dex", "wis", "cha", "int"],
        druid: ["wis", "con", "dex", "int", "cha", "str"],
        paladin: ["str", "cha", "con", "wis", "dex", "int"],
        ranger: ["dex", "wis", "con", "str", "int", "cha"],
        sorcerer: ["cha", "con", "dex", "wis", "int", "str"],
        warlock: ["cha", "con", "dex", "wis", "int", "str"],
      };

      const priority = classStatPriority[className.toLowerCase()] ?? classStatPriority["fighter"]!;
      const assigned: Record<string, number> = {};
      for (let i = 0; i < 6; i++) {
        assigned[priority[i]!] = sorted[i]!;
      }

      const str = assigned["str"]!;
      const dex = assigned["dex"]!;
      const con = assigned["con"]!;
      const int = assigned["int"]!;
      const wis = assigned["wis"]!;
      const cha = assigned["cha"]!;

      // Compute derived stats
      const prof = proficiencyBonus(level);
      const conMod = abilityModifier(con);
      const dexMod = abilityModifier(dex);
      const wisMod = abilityModifier(wis);

      // HP: hit die max at level 1, then average rolls for remaining levels
      const avgRoll = Math.floor(hitDie / 2) + 1;
      const hpMax = hitDie + conMod + (level - 1) * (avgRoll + conMod);

      // AC: depends on class
      let ac: number;
      if (className.toLowerCase() === "monk") {
        ac = 10 + dexMod + wisMod; // Unarmored Defense
      } else if (className.toLowerCase() === "barbarian") {
        ac = 10 + dexMod + conMod; // Unarmored Defense
      } else {
        ac = 10 + dexMod + 2; // Assume light armor (+2)
      }

      // Speed
      let speed = 30;
      if (className.toLowerCase() === "monk" && level >= 2) {
        const unarmMovement = Math.floor((level - 1) / 4) * 5 + 10;
        speed = 30 + Math.min(unarmMovement, 20);
      }

      // Ki for monks
      let kiMax: number | null = null;
      let kiCurrent: number | null = null;
      if (className.toLowerCase() === "monk" && level >= 2) {
        kiMax = level;
        kiCurrent = level;
      }

      // Default skill proficiencies based on class
      const classSkills: Record<string, string[]> = {
        monk: ["stealth", "acrobatics"],
        fighter: ["athletics", "intimidation"],
        rogue: ["stealth", "sleight_of_hand", "deception", "perception"],
        wizard: ["arcana", "investigation"],
        cleric: ["medicine", "religion"],
        bard: ["persuasion", "performance", "deception"],
        barbarian: ["athletics", "intimidation"],
        ranger: ["survival", "perception"],
        paladin: ["athletics", "persuasion"],
        sorcerer: ["arcana", "persuasion"],
        warlock: ["arcana", "deception"],
        druid: ["nature", "survival"],
      };
      const skillProfs = classSkills[className.toLowerCase()] ?? ["athletics", "perception"];

      // Build class resources from SRD
      const classResources = await buildResourceMap(srd, className, level);

      // Create save
      const saveId = crypto.randomUUID();
      await store.createSave(saveId, ctx.chatId, `${name}'s Adventure`);

      // Create character
      await store.createCharacter({
        save_id: saveId,
        name,
        race,
        class: className,
        subclass: null,
        level,
        xp: 0,
        str, dex, con, int, wis, cha,
        hp_current: hpMax,
        hp_max: hpMax,
        ac,
        speed,
        proficiency_bonus: prof,
        ki_current: kiCurrent,
        ki_max: kiMax,
        spell_slots_json: null,
        hit_dice_remaining: level,
        skill_proficiencies: JSON.stringify(skillProfs),
        save_proficiencies: JSON.stringify(saveProficiencies),
        class_resources_json: JSON.stringify(classResources),
        tool_proficiencies: "[]",
      });

      // Add starting equipment
      await store.addItem(saveId, { name: "Simple robes", category: "armor", equipped: true });
      await store.addItem(saveId, { name: "Backpack", category: "gear" });
      await store.addItem(saveId, { name: "Waterskin", category: "gear" });
      await store.addItem(saveId, { name: "Gold", qty: 10, category: "coin" });

      // Render and save documents
      const char = (await store.getCharacter(saveId))!;
      const inv = await store.getInventory(saveId);
      const sheetDoc = renderCharacterSheet(char, inv);
      await store.setDocument(saveId, "character", sheetDoc);

      // Initial world state
      await store.setDocument(saveId, "scene", "The adventure has not yet begun.");
      const { renderWorldState } = await import("../state/documents");
      const worldDoc = renderWorldState([], [], [], "The adventure has not yet begun.");
      await store.setDocument(saveId, "world", worldDoc);

      // Format the roll results
      const rollLines = details.map((d, i) => {
        const ability = priority[i]!.toUpperCase();
        return `  ${ability}: [${d.rolls.join(", ")}] → keep [${d.kept.join(", ")}] = ${d.total}`;
      });

      return {
        text: `🎲 **Character Created!**

${rollLines.join("\n")}

${sheetDoc}

${name} stands at the entrance. Type anything to begin your adventure, or use /sheet, /abilities, /inventory to inspect your character.`,
      };
    },
  };
}
