/**
 * Skill-to-ability mapping and modifier computation.
 * This is the bridge between "the model says 'stealth'" and
 * "the resolver gets modifier +9".
 */

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const SKILL_TO_ABILITY: Record<string, Ability> = {
  athletics: "str",
  acrobatics: "dex",
  sleight_of_hand: "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  nature: "int",
  religion: "int",
  animal_handling: "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};

export const ALL_SKILLS = Object.keys(SKILL_TO_ABILITY);

/** Normalize a skill name to match our map keys. Handles spaces, hyphens, case. */
export function normalizeSkillName(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]+/g, "_");
}

/** Convert an ability score (e.g. 16) to its modifier (e.g. +3). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus by character level (from the SRD). */
export function proficiencyBonus(level: number): number {
  if (level < 1) return 2;
  return Math.ceil(level / 4) + 1;
}

export interface CharacterScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface ModifierLookupParams {
  scores: CharacterScores;
  level: number;
  skillProficiencies: string[];
  saveProficiencies: Ability[];
}

/** Get the modifier for a skill check (ability mod + proficiency if proficient). */
export function skillModifier(skill: string, params: ModifierLookupParams): number {
  const normalized = normalizeSkillName(skill);
  const ability = SKILL_TO_ABILITY[normalized];
  if (!ability) {
    throw new Error(`unknown skill: ${skill}`);
  }
  const base = abilityModifier(params.scores[ability]);
  const prof = params.skillProficiencies.map(normalizeSkillName).includes(normalized)
    ? proficiencyBonus(params.level)
    : 0;
  return base + prof;
}

/** Get the modifier for a saving throw. */
export function saveModifier(ability: Ability, params: ModifierLookupParams): number {
  const base = abilityModifier(params.scores[ability]);
  const prof = params.saveProficiencies.includes(ability)
    ? proficiencyBonus(params.level)
    : 0;
  return base + prof;
}

/** Get the modifier for a raw ability check (no skill, no proficiency). */
export function abilityCheckModifier(ability: Ability, params: CharacterScores): number {
  return abilityModifier(params[ability]);
}
