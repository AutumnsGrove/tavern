/**
 * Document renderer. Turns structured DB tables into the two
 * markdown documents that get injected into the narrator's context.
 *
 * These are "materialized views" — always consistent with the
 * underlying tables, re-rendered on every state change.
 */

import { abilityModifier, proficiencyBonus, skillModifier, SKILL_TO_ABILITY } from "../resolver/skills";
import type { Character, InventoryItem, Npc, Flag, Scene } from "./store";
import type { ModifierLookupParams, CharacterScores } from "../resolver/skills";

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function buildModifierParams(char: Character): ModifierLookupParams {
  return {
    scores: {
      str: char.str,
      dex: char.dex,
      con: char.con,
      int: char.int,
      wis: char.wis,
      cha: char.cha,
    },
    level: char.level,
    skillProficiencies: JSON.parse(char.skill_proficiencies) as string[],
    saveProficiencies: JSON.parse(char.save_proficiencies) as string[],
  };
}

export function renderCharacterSheet(
  char: Character,
  inventory: InventoryItem[],
): string {
  const params = buildModifierParams(char);
  const scores: CharacterScores = params.scores;
  const prof = proficiencyBonus(char.level);

  // Ability score table
  const abilities = (["str", "dex", "con", "int", "wis", "cha"] as const)
    .map((a) => `${a.toUpperCase()} ${char[a]} (${sign(abilityModifier(char[a]))})`)
    .join(" · ");

  // Skills with proficiency markers
  const skillProfs = new Set(JSON.parse(char.skill_proficiencies) as string[]);
  const skillLines = Object.keys(SKILL_TO_ABILITY)
    .sort()
    .map((skill) => {
      const mod = skillModifier(skill, params);
      const marker = skillProfs.has(skill) ? "★" : " ";
      const name = skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `${marker} ${name}: ${sign(mod)}`;
    });

  // Save proficiencies
  const saveProfs = new Set(JSON.parse(char.save_proficiencies) as string[]);
  const saveLines = (["str", "dex", "con", "int", "wis", "cha"] as const)
    .map((a) => {
      const base = abilityModifier(char[a]);
      const bonus = saveProfs.has(a) ? prof : 0;
      const marker = saveProfs.has(a) ? "★" : " ";
      return `${marker} ${a.toUpperCase()}: ${sign(base + bonus)}`;
    });

  // Class resources
  const resourceLines: string[] = [];
  if (char.ki_max !== null && char.ki_current !== null) {
    resourceLines.push(`Ki: ${char.ki_current}/${char.ki_max}`);
  }
  if (char.spell_slots_json) {
    try {
      const slots = JSON.parse(char.spell_slots_json) as Record<string, number>;
      for (const [level, count] of Object.entries(slots)) {
        if (count > 0) resourceLines.push(`Spell Slots (${level}): ${count}`);
      }
    } catch { /* ignore malformed */ }
  }
  if (char.hit_dice_remaining !== null) {
    resourceLines.push(`Hit Dice: ${char.hit_dice_remaining}d${8} remaining`);
  }

  // Inventory grouped by category
  const grouped = new Map<string, InventoryItem[]>();
  for (const item of inventory) {
    const cat = item.category ?? "gear";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const inventoryLines: string[] = [];
  const categoryOrder = ["weapon", "armor", "gear", "quest", "coin"];
  for (const cat of categoryOrder) {
    const items = grouped.get(cat);
    if (!items?.length) continue;
    inventoryLines.push(`**${cat.charAt(0).toUpperCase() + cat.slice(1)}:**`);
    for (const item of items) {
      let line = `  • ${item.name}`;
      if (item.qty > 1) line += ` (x${item.qty})`;
      if (item.unit) line += ` ${item.unit}`;
      if (item.equipped) line += " [equipped]";
      if (item.notes) line += ` — ${item.notes}`;
      inventoryLines.push(line);
    }
  }
  // Any categories not in the standard order
  for (const [cat, items] of grouped) {
    if (categoryOrder.includes(cat)) continue;
    inventoryLines.push(`**${cat.charAt(0).toUpperCase() + cat.slice(1)}:**`);
    for (const item of items) {
      let line = `  • ${item.name}`;
      if (item.qty > 1) line += ` (x${item.qty})`;
      if (item.unit) line += ` ${item.unit}`;
      if (item.notes) line += ` — ${item.notes}`;
      inventoryLines.push(line);
    }
  }

  const subclassLine = char.subclass ? ` · ${char.subclass}` : "";

  return `# ${char.name} — Character Sheet
*${char.race} ${char.class}${subclassLine} · Level ${char.level}*

## Core
- HP: ${char.hp_current}/${char.hp_max}
- AC: ${char.ac}
- Speed: ${char.speed} ft
- Proficiency Bonus: ${sign(prof)}

## Ability Scores
${abilities}

## Saving Throws
${saveLines.join("\n")}

## Skills
${skillLines.join("\n")}
${resourceLines.length > 0 ? `\n## Class Resources\n${resourceLines.join("\n")}` : ""}

## Inventory
${inventoryLines.length > 0 ? inventoryLines.join("\n") : "(empty)"}`;
}

export function renderWorldState(
  npcs: Npc[],
  flags: Flag[],
  scenes: Scene[],
  currentScene?: string,
  notes?: string,
): string {
  // NPCs
  const npcLines = npcs
    .filter((n) => n.alive)
    .map((n) => {
      let line = `• **${n.name}**`;
      if (n.role) line += ` — ${n.role}`;
      if (n.loyalty !== null) line += ` (loyalty: ${n.loyalty}/100)`;
      if (n.notes) line += ` — ${n.notes}`;
      return line;
    });

  const deadNpcs = npcs.filter((n) => !n.alive);
  if (deadNpcs.length > 0) {
    npcLines.push("");
    npcLines.push("*Fallen:*");
    for (const n of deadNpcs) {
      npcLines.push(`• ~~${n.name}~~ ${n.notes ? `— ${n.notes}` : ""}`);
    }
  }

  // Flags (readable)
  const flagLines = flags.map((f) => {
    if (f.value === "true") return `• ${f.key.replace(/_/g, " ")}`;
    return `• ${f.key.replace(/_/g, " ")}: ${f.value}`;
  });

  // Story so far (scene summaries)
  const storyLines = scenes.map(
    (s, i) => `**${i + 1}.** ${s.summary}`
  );

  return `# World State

## Current Scene
${currentScene ?? "(no active scene)"}

${storyLines.length > 0 ? `## Story So Far\n${storyLines.join("\n\n")}` : ""}

## Active NPCs
${npcLines.length > 0 ? npcLines.join("\n") : "(none)"}

## World Flags
${flagLines.length > 0 ? flagLines.join("\n") : "(none)"}
${notes ? `\n## Notes\n${notes}` : ""}`.trim();
}
