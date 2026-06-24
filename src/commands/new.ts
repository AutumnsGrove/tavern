/**
 * /new command — start character creation.
 *
 * Two modes:
 *   /new                  → interactive step-by-step onboarding
 *   /new Sayola Monk Tiefling 10 → quick creation (skip the wizard)
 *
 * The interactive flow stores state and advances on each player
 * input until complete.
 */

import type { CommandDef } from "../gateway/commands";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";
import { rollAbilityScores } from "../resolver/dice";
import { abilityModifier, proficiencyBonus } from "../resolver/skills";
import { renderCharacterSheet } from "../state/documents";
import { buildResourceMap } from "../resolver/resources";
import {
  startOnboarding,
  advanceOnboarding,
  buildCharacterFromOnboarding,
} from "../onboarding/flow";
import type { OnboardingState } from "../onboarding/flow";
import { config } from "../config";

// Per-chat onboarding state (held in memory)
const activeFlows = new Map<string, OnboardingState>();

export function getActiveFlow(chatId: string): OnboardingState | undefined {
  return activeFlows.get(chatId);
}

export function clearActiveFlow(chatId: string): void {
  activeFlows.delete(chatId);
}

/**
 * Handle onboarding input — called when a player has an active flow.
 */
export async function handleOnboardingInput(
  chatId: string,
  input: string,
  store: GameStore,
  srd: SrdLoader,
): Promise<{ text: string; forks?: Array<{ label: string; detail: string }> }> {
  const state = activeFlows.get(chatId);
  if (!state) return { text: "No active onboarding. Use /new to start." };

  const result = await advanceOnboarding(state, input, srd);
  activeFlows.set(chatId, result.state);

  if (result.done) {
    activeFlows.delete(chatId);
    const { saveId, sheetDoc } = await buildCharacterFromOnboarding(
      result.state, store, srd, chatId,
    );

    const subclassNote = result.state.subclass ? ` (${result.state.subclass})` : "";
    return {
      text: `🎉 **Character Created!**\n\n*${result.state.name} — Level ${result.state.level} ${result.state.race} ${result.state.class}${subclassNote}*\n\n${sheetDoc}\n\n${result.state.name} stands at the entrance. Type anything to begin your adventure, or use /sheet, /abilities, /inventory to inspect your character.`,
    };
  }

  return { text: result.text, forks: result.forks };
}

export function newCommand(store: GameStore, srd: SrdLoader): CommandDef {
  return {
    name: "new",
    description: "Start a new campaign",
    requiresSave: false,
    handler: async (ctx) => {
      const parts = ctx.args.split(/\s+/).filter(Boolean);

      // Quick mode: /new Name Class Race Level
      if (parts.length >= 2) {
        return quickCreate(store, srd, ctx.chatId, parts);
      }

      // Interactive mode
      const result = await startOnboarding(srd);
      activeFlows.set(ctx.chatId, result.state);

      return { text: result.text, forks: result.forks };
    },
  };
}

/**
 * Quick character creation — same as before, for power users.
 */
async function quickCreate(
  store: GameStore,
  srd: SrdLoader,
  chatId: string,
  parts: string[],
): Promise<{ text: string }> {
  const name = parts[0] || "Adventurer";
  const className = parts[1] || "Fighter";
  const race = parts[2] || "Human";
  const level = parseInt(parts[3] || String(config.defaultLevel), 10);

  const { scores, details } = rollAbilityScores();
  const sorted = [...scores].sort((a, b) => b - a);

  const classData = await srd.lookup<{
    hit_die: number;
    saving_throws: Array<{ index: string }>;
  }>("class", className.toLowerCase());

  const hitDie = classData?.hit_die ?? 10;
  const saveProficiencies = classData?.saving_throws?.map(
    (s) => s.index.toLowerCase(),
  ) ?? ["str", "con"];

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

  const prof = proficiencyBonus(level);
  const conMod = abilityModifier(con);
  const dexMod = abilityModifier(dex);
  const wisMod = abilityModifier(wis);

  const avgRoll = Math.floor(hitDie / 2) + 1;
  const hpMax = hitDie + conMod + (level - 1) * (avgRoll + conMod);

  let ac: number;
  if (className.toLowerCase() === "monk") {
    ac = 10 + dexMod + wisMod;
  } else if (className.toLowerCase() === "barbarian") {
    ac = 10 + dexMod + abilityModifier(con);
  } else {
    ac = 10 + dexMod + 2;
  }

  let speed = 30;
  if (className.toLowerCase() === "monk" && level >= 2) {
    const unarmMovement = Math.floor((level - 1) / 4) * 5 + 10;
    speed = 30 + Math.min(unarmMovement, 20);
  }

  let kiMax: number | null = null;
  let kiCurrent: number | null = null;
  if (className.toLowerCase() === "monk" && level >= 2) {
    kiMax = level;
    kiCurrent = level;
  }

  const classResources = await buildResourceMap(srd, className, level);

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

  const saveId = crypto.randomUUID();
  await store.createSave(saveId, chatId, `${name}'s Adventure`);

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
    class_resources_json: JSON.stringify(classResources),
    skill_proficiencies: JSON.stringify(skillProfs),
    save_proficiencies: JSON.stringify(saveProficiencies),
    tool_proficiencies: "[]",
  });

  await store.addItem(saveId, { name: "Simple robes", category: "armor", equipped: true });
  await store.addItem(saveId, { name: "Backpack", category: "gear" });
  await store.addItem(saveId, { name: "Waterskin", category: "gear" });
  await store.addItem(saveId, { name: "Gold", qty: 10, category: "coin" });

  const char = (await store.getCharacter(saveId))!;
  const inv = await store.getInventory(saveId);
  const sheetDoc = renderCharacterSheet(char, inv);
  await store.setDocument(saveId, "character", sheetDoc);

  await store.setDocument(saveId, "scene", "The adventure has not yet begun.");
  const { renderWorldState } = await import("../state/documents");
  const worldDoc = renderWorldState([], [], [], "The adventure has not yet begun.");
  await store.setDocument(saveId, "world", worldDoc);

  const rollLines = details.map((d, i) => {
    const ability = priority[i]!.toUpperCase();
    return `  ${ability}: [${d.rolls.join(", ")}] → keep [${d.kept.join(", ")}] = ${d.total}`;
  });

  return {
    text: `🎲 **Character Created!**\n\n${rollLines.join("\n")}\n\n${sheetDoc}\n\n${name} stands at the entrance. Type anything to begin your adventure, or use /sheet, /abilities, /inventory to inspect your character.`,
  };
}
