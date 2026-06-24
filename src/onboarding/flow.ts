/**
 * Interactive onboarding flow. Step-by-step character creation
 * that works with both CLI (numbered lists) and Telegram (inline
 * keyboards). Each step returns text + forks. When the player
 * picks a fork, the flow advances.
 *
 * Flow:
 *   1. Race selection
 *   2. Class selection
 *   3. Stats rolled + shown
 *   4. Level selection
 *   5. Subclass (if level ≥ 3 and SRD has one)
 *   6. Skill proficiency multi-pick
 *   7. Name
 *   8. Summary → character created
 */

import type { Fork } from "../gateway/types";
import type { SrdLoader } from "../srd/loader";
import type { GameStore } from "../state/store";
import { rollAbilityScores } from "../resolver/dice";
import { abilityModifier, proficiencyBonus } from "../resolver/skills";
import { buildResourceMap } from "../resolver/resources";
import { renderCharacterSheet } from "../state/documents";
import { renderWorldState } from "../state/documents";
import { config } from "../config";

export type OnboardingStep =
  | "race"
  | "class"
  | "stats"
  | "level"
  | "subclass"
  | "skills"
  | "name"
  | "done";

export interface OnboardingState {
  step: OnboardingStep;
  race?: string;
  raceIndex?: string;
  class?: string;
  classIndex?: string;
  scores?: number[];
  scoreDetails?: Array<{ rolls: number[]; kept: number[]; total: number }>;
  statAssignment?: Record<string, number>;
  level?: number;
  subclass?: string | null;
  skillProficiencies?: string[];
  skillsToChoose?: number;
  availableSkills?: string[];
  name?: string;
}

export interface StepResult {
  text: string;
  forks: Fork[];
  done: boolean;
  state: OnboardingState;
}

function sign(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Start a new onboarding flow.
 */
export async function startOnboarding(srd: SrdLoader): Promise<StepResult> {
  const state: OnboardingState = { step: "race" };
  return runStep(state, "", srd);
}

/**
 * Advance the flow with the player's choice.
 */
export async function advanceOnboarding(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  return runStep(state, input, srd);
}

async function runStep(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  switch (state.step) {
    case "race":
      return stepRace(state, input, srd);
    case "class":
      return stepClass(state, input, srd);
    case "stats":
      return stepStats(state);
    case "level":
      return stepLevel(state, input);
    case "subclass":
      return stepSubclass(state, input, srd);
    case "skills":
      return stepSkills(state, input, srd);
    case "name":
      return stepName(state, input);
    case "done":
      return { text: "", forks: [], done: true, state };
    default:
      return { text: "Unknown step.", forks: [], done: true, state };
  }
}

// ── Step: Race ──────────────────────────────────────────────────

interface SrdRace {
  index: string;
  name: string;
  speed: number;
  ability_bonuses: Array<{ ability_score: { index: string; name: string }; bonus: number }>;
  traits: Array<{ name: string }>;
}

async function stepRace(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  const raceIndices = await srd.index("race");
  const races: SrdRace[] = [];
  for (const idx of raceIndices) {
    const r = await srd.lookup<SrdRace>("race", idx);
    if (r) races.push(r);
  }

  // If input is a selection, apply it
  if (input) {
    const picked = matchChoice(input, races.map((r) => ({ label: r.name, value: r.index })));
    if (picked) {
      const race = races.find((r) => r.index === picked)!;
      state.race = race.name;
      state.raceIndex = race.index;
      state.step = "class";
      return runStep(state, "", srd);
    }
  }

  // Show race options
  const forks: Fork[] = races.map((r) => {
    const bonuses = r.ability_bonuses.map((b) => `${b.ability_score.name} ${sign(b.bonus)}`).join(", ");
    const traits = r.traits.map((t) => t.name).join(", ");
    return {
      label: r.name,
      detail: `${bonuses}${traits ? ` · ${traits}` : ""} · Speed ${r.speed}`,
    };
  });

  return {
    text: `🎭 **Choose Your Race**\n\nYour race determines ability bonuses, traits, and speed.`,
    forks,
    done: false,
    state,
  };
}

// ── Step: Class ─────────────────────────────────────────────────

interface SrdClass {
  index: string;
  name: string;
  hit_die: number;
  saving_throws: Array<{ index: string; name: string }>;
  subclasses: Array<{ index: string; name: string }>;
  proficiency_choices: Array<{
    choose: number;
    from: { options: Array<{ item?: { index: string; name: string } }> };
  }>;
}

async function stepClass(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  const classIndices = await srd.index("class");
  const classes: SrdClass[] = [];
  for (const idx of classIndices) {
    const c = await srd.lookup<SrdClass>("class", idx);
    if (c) classes.push(c);
  }

  if (input) {
    const picked = matchChoice(input, classes.map((c) => ({ label: c.name, value: c.index })));
    if (picked) {
      const cls = classes.find((c) => c.index === picked)!;
      state.class = cls.name;
      state.classIndex = cls.index;

      // Extract skill choices for later
      const skillChoice = cls.proficiency_choices.find(
        (pc) => pc.from.options.some((o) => o.item?.index.startsWith("skill-")),
      );
      if (skillChoice) {
        state.skillsToChoose = skillChoice.choose;
        state.availableSkills = skillChoice.from.options
          .map((o) => o.item?.name.replace("Skill: ", "") ?? "")
          .filter(Boolean);
      }

      state.step = "stats";
      return runStep(state, "", srd);
    }
  }

  const hitDieLabel: Record<number, string> = {
    6: "d6 (fragile)", 8: "d8 (moderate)", 10: "d10 (tough)", 12: "d12 (toughest)",
  };

  const forks: Fork[] = classes.map((c) => {
    const saves = c.saving_throws.map((s) => s.name).join(", ");
    return {
      label: c.name,
      detail: `Hit Die: ${hitDieLabel[c.hit_die] ?? `d${c.hit_die}`} · Saves: ${saves}`,
    };
  });

  return {
    text: `⚔️ **Choose Your Class**\n\n*Race: ${state.race}*\n\nYour class determines your abilities, hit points, and playstyle.`,
    forks,
    done: false,
    state,
  };
}

// ── Step: Stats ─────────────────────────────────────────────────

async function stepStats(state: OnboardingState): Promise<StepResult> {
  // Roll stats
  const { scores, details } = rollAbilityScores();
  state.scores = scores;
  state.scoreDetails = details;

  // Auto-assign using class priority
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

  const priority = classStatPriority[state.classIndex ?? "fighter"] ?? classStatPriority["fighter"]!;
  const sorted = [...scores].sort((a, b) => b - a);
  const assigned: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    assigned[priority[i]!] = sorted[i]!;
  }
  state.statAssignment = assigned;

  const rollLines = details.map((d, i) => {
    const ability = priority[i]!.toUpperCase();
    return `  ${ability}: [${d.rolls.join(", ")}] → keep [${d.kept.join(", ")}] = **${d.total}** (${sign(abilityModifier(d.total))})`;
  });

  state.step = "level";
  return {
    text: `🎲 **Ability Scores Rolled!**\n\n*${state.race} ${state.class} — 4d6 drop lowest, smart-assigned:*\n\n${rollLines.join("\n")}\n\n*Scores are assigned to optimize your ${state.class}.*`,
    forks: [
      { label: "Keep these", detail: "Accept the rolled scores" },
      { label: "Reroll", detail: "Roll a new set of ability scores" },
    ],
    done: false,
    state,
  };
}

// ── Step: Level ─────────────────────────────────────────────────

async function stepLevel(
  state: OnboardingState,
  input: string,
): Promise<StepResult> {
  // Handle reroll from stats step
  if (input.toLowerCase().includes("reroll")) {
    state.step = "stats";
    return stepStats(state);
  }

  if (input && !input.toLowerCase().includes("keep")) {
    // Parse "Level 3", "3", or "Level 3" format
    const levelMatch = input.match(/(?:level\s+)?(\d+)/i);
    const num = levelMatch ? parseInt(levelMatch[1]!, 10) : NaN;
    if (num >= 1 && num <= 20) {
      state.level = num;

      // Decide next step
      if (num >= 3) {
        state.step = "subclass";
      } else if (state.skillsToChoose) {
        state.step = "skills";
      } else {
        state.step = "name";
      }
      return runStep(state, "", null as any);
    }
  }

  const forks: Fork[] = [
    { label: "Level 1", detail: "Fresh adventurer, learn the basics" },
    { label: "Level 3", detail: "Recommended — subclass unlocked, core abilities online" },
    { label: "Level 5", detail: "Experienced — Extra Attack / 3rd-level spells" },
    { label: "Level 10", detail: "Veteran — powerful features and deeper options" },
  ];

  return {
    text: `📊 **Choose Starting Level**\n\n*${state.race} ${state.class}*\n\nHigher levels unlock more features and resources. Level 3-5 is recommended for the best balance of options and challenge.`,
    forks,
    done: false,
    state,
  };
}

// ── Step: Subclass ──────────────────────────────────────────────

async function stepSubclass(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  const classData = await srd.lookup<SrdClass>("class", state.classIndex!);
  const subclasses = classData?.subclasses ?? [];

  // SRD only has one subclass per class — auto-pick if only one
  if (subclasses.length === 1) {
    state.subclass = subclasses[0]!.name;
    state.step = state.skillsToChoose ? "skills" : "name";
    return runStep(state, "", srd);
  }

  if (subclasses.length === 0) {
    state.subclass = null;
    state.step = state.skillsToChoose ? "skills" : "name";
    return runStep(state, "", srd);
  }

  if (input) {
    const picked = matchChoice(input, subclasses.map((s) => ({ label: s.name, value: s.name })));
    if (picked) {
      state.subclass = picked;
      state.step = state.skillsToChoose ? "skills" : "name";
      return runStep(state, "", srd);
    }
  }

  const forks: Fork[] = subclasses.map((s) => ({
    label: s.name,
    detail: `${state.class} subclass`,
  }));

  return {
    text: `🔮 **Choose Your Subclass**\n\n*${state.race} ${state.class} ${state.level}*`,
    forks,
    done: false,
    state,
  };
}

// ── Step: Skill Proficiencies ───────────────────────────────────

async function stepSkills(
  state: OnboardingState,
  input: string,
  srd: SrdLoader,
): Promise<StepResult> {
  if (!state.skillProficiencies) {
    state.skillProficiencies = [];
  }

  const available = state.availableSkills ?? [];
  const toChoose = state.skillsToChoose ?? 2;
  const remaining = toChoose - state.skillProficiencies.length;

  if (input && remaining > 0) {
    const picked = matchChoice(input, available
      .filter((s) => !state.skillProficiencies!.includes(s))
      .map((s) => ({ label: s, value: s })));
    if (picked) {
      state.skillProficiencies.push(picked);
    }
  }

  if (state.skillProficiencies.length >= toChoose) {
    state.step = "name";
    return runStep(state, "", srd);
  }

  const chosen = new Set(state.skillProficiencies);
  const forks: Fork[] = available
    .filter((s) => !chosen.has(s))
    .map((s) => ({ label: s, detail: `Become proficient in ${s}` }));

  const pickedSoFar = state.skillProficiencies.length > 0
    ? `\n\n*Selected: ${state.skillProficiencies.join(", ")}*`
    : "";

  return {
    text: `📝 **Choose Skill Proficiencies** (${remaining} remaining)\n\n*${state.race} ${state.class}*${pickedSoFar}`,
    forks,
    done: false,
    state,
  };
}

// ── Step: Name ──────────────────────────────────────────────────

async function stepName(
  state: OnboardingState,
  input: string,
): Promise<StepResult> {
  if (input && input.length > 0 && !input.startsWith("/")) {
    state.name = input;
    state.step = "done";
    return { text: "", forks: [], done: true, state };
  }

  const subclassNote = state.subclass ? ` (${state.subclass})` : "";

  return {
    text: `✍️ **Name Your Character**\n\n*Level ${state.level} ${state.race} ${state.class}${subclassNote}*\n\nType a name for your character:`,
    forks: [
      { label: "Adventurer", detail: "Use the default name" },
      { label: "Random", detail: "Let the engine pick a name" },
    ],
    done: false,
    state,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function matchChoice(
  input: string,
  options: Array<{ label: string; value: string }>,
): string | null {
  const trimmed = input.trim();

  // Try exact match first
  const exact = options.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.value.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact.value;

  // Try number match
  const num = parseInt(trimmed, 10);
  if (num >= 1 && num <= options.length && trimmed === String(num)) {
    return options[num - 1]!.value;
  }

  // Try "Level N" format
  const levelMatch = trimmed.match(/^level\s+(\d+)$/i);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1]!, 10);
    if (lvl >= 1 && lvl <= 20) return String(lvl);
  }

  // Try partial match
  const partial = options.find(
    (o) => o.label.toLowerCase().includes(trimmed.toLowerCase()),
  );
  if (partial) return partial.value;

  return null;
}

/**
 * Build the character from completed onboarding state.
 */
export async function buildCharacterFromOnboarding(
  state: OnboardingState,
  store: GameStore,
  srd: SrdLoader,
  chatId: string,
): Promise<{ saveId: string; sheetDoc: string }> {
  const assigned = state.statAssignment!;
  const level = state.level ?? config.defaultLevel;
  const className = state.class!;
  const classIndex = state.classIndex!;
  const race = state.race!;
  const name = state.name === "Random" ? generateRandomName() : (state.name ?? "Adventurer");

  const str = assigned["str"]!;
  const dex = assigned["dex"]!;
  const con = assigned["con"]!;
  const int = assigned["int"]!;
  const wis = assigned["wis"]!;
  const cha = assigned["cha"]!;

  // Apply racial ability bonuses
  const raceData = await srd.lookup<SrdRace>("race", state.raceIndex!);
  const bonuses: Record<string, number> = {};
  if (raceData) {
    for (const b of raceData.ability_bonuses) {
      bonuses[b.ability_score.index] = b.bonus;
    }
  }
  const finalStr = str + (bonuses["str"] ?? 0);
  const finalDex = dex + (bonuses["dex"] ?? 0);
  const finalCon = con + (bonuses["con"] ?? 0);
  const finalInt = int + (bonuses["int"] ?? 0);
  const finalWis = wis + (bonuses["wis"] ?? 0);
  const finalCha = cha + (bonuses["cha"] ?? 0);

  // Derived stats
  const prof = proficiencyBonus(level);
  const conMod = abilityModifier(finalCon);
  const dexMod = abilityModifier(finalDex);
  const wisMod = abilityModifier(finalWis);

  // Hit die from class
  const classData = await srd.lookup<SrdClass>("class", classIndex);
  const hitDie = classData?.hit_die ?? 10;
  const saveProficiencies = classData?.saving_throws?.map((s) => s.index) ?? ["str", "con"];

  // HP
  const avgRoll = Math.floor(hitDie / 2) + 1;
  const hpMax = hitDie + conMod + (level - 1) * (avgRoll + conMod);

  // AC
  let ac: number;
  if (classIndex === "monk") {
    ac = 10 + dexMod + wisMod;
  } else if (classIndex === "barbarian") {
    ac = 10 + dexMod + abilityModifier(finalCon);
  } else {
    ac = 10 + dexMod + 2;
  }

  // Speed (with monk bonus)
  let speed = raceData?.speed ?? 30;
  if (classIndex === "monk" && level >= 2) {
    const unarmMovement = Math.floor((level - 1) / 4) * 5 + 10;
    speed += Math.min(unarmMovement, 20);
  }

  // Ki for monks (legacy fields)
  let kiMax: number | null = null;
  let kiCurrent: number | null = null;
  if (classIndex === "monk" && level >= 2) {
    kiMax = level;
    kiCurrent = level;
  }

  // Class resources from SRD
  const classResources = await buildResourceMap(srd, className, level);

  // Skill proficiencies
  const skillProfs = state.skillProficiencies ?? getDefaultSkills(classIndex);

  // Create save
  const saveId = crypto.randomUUID();
  await store.createSave(saveId, chatId, `${name}'s Adventure`);

  await store.createCharacter({
    save_id: saveId,
    name,
    race,
    class: className,
    subclass: state.subclass ?? null,
    level,
    xp: 0,
    str: finalStr, dex: finalDex, con: finalCon,
    int: finalInt, wis: finalWis, cha: finalCha,
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
    skill_proficiencies: JSON.stringify(skillProfs.map((s) => s.toLowerCase().replace(/ /g, "_"))),
    save_proficiencies: JSON.stringify(saveProficiencies),
    tool_proficiencies: "[]",
  });

  // Starting equipment
  await store.addItem(saveId, { name: "Simple robes", category: "armor", equipped: true });
  await store.addItem(saveId, { name: "Backpack", category: "gear" });
  await store.addItem(saveId, { name: "Waterskin", category: "gear" });
  await store.addItem(saveId, { name: "Gold", qty: 10, category: "coin" });

  // Render and save documents
  const char = (await store.getCharacter(saveId))!;
  const inv = await store.getInventory(saveId);
  const sheetDoc = renderCharacterSheet(char, inv);
  await store.setDocument(saveId, "character", sheetDoc);

  await store.setDocument(saveId, "scene", "The adventure has not yet begun.");
  const worldDoc = renderWorldState([], [], [], "The adventure has not yet begun.");
  await store.setDocument(saveId, "world", worldDoc);

  return { saveId, sheetDoc };
}

function getDefaultSkills(classIndex: string): string[] {
  const defaults: Record<string, string[]> = {
    monk: ["Stealth", "Acrobatics"],
    fighter: ["Athletics", "Intimidation"],
    rogue: ["Stealth", "Sleight of Hand", "Deception", "Perception"],
    wizard: ["Arcana", "Investigation"],
    cleric: ["Medicine", "Religion"],
    bard: ["Persuasion", "Performance", "Deception"],
    barbarian: ["Athletics", "Intimidation"],
    ranger: ["Survival", "Perception"],
    paladin: ["Athletics", "Persuasion"],
    sorcerer: ["Arcana", "Persuasion"],
    warlock: ["Arcana", "Deception"],
    druid: ["Nature", "Survival"],
  };
  return defaults[classIndex] ?? ["Athletics", "Perception"];
}

const RANDOM_NAMES = [
  "Thorn", "Vesper", "Ember", "Rook", "Lyra", "Grimm", "Sable", "Fenn",
  "Isolde", "Kael", "Nyx", "Rowan", "Zephyr", "Ash", "Briar", "Cinder",
];

function generateRandomName(): string {
  const idx = Math.floor(Math.random() * RANDOM_NAMES.length);
  return RANDOM_NAMES[idx]!;
}
