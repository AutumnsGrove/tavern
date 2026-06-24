import { describe, it, expect } from "vitest";
import {
  abilityModifier,
  proficiencyBonus,
  skillModifier,
  saveModifier,
  abilityCheckModifier,
  SKILL_TO_ABILITY,
  ALL_SKILLS,
} from "./skills";
import type { ModifierLookupParams, CharacterScores } from "./skills";

describe("abilityModifier", () => {
  const cases: [number, number][] = [
    [1, -5],
    [3, -4],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 2],
    [15, 2],
    [16, 3],
    [17, 3],
    [18, 4],
    [20, 5],
    [30, 10],
  ];

  it.each(cases)("score %i → modifier %i", (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });
});

describe("proficiencyBonus", () => {
  const cases: [number, number][] = [
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ];

  it.each(cases)("level %i → proficiency +%i", (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

// Sayola-like character for integration tests
const sayolaScores: CharacterScores = {
  str: 10,  // +0
  dex: 20,  // +5
  con: 12,  // +1
  int: 10,  // +0
  wis: 16,  // +3
  cha: 14,  // +2
};

const sayolaParams: ModifierLookupParams = {
  scores: sayolaScores,
  level: 10,
  skillProficiencies: ["stealth", "acrobatics", "insight", "athletics"],
  saveProficiencies: ["str", "dex"],
};

describe("skillModifier", () => {
  it("stealth = DEX (+5) + proficiency (+4) = +9", () => {
    expect(skillModifier("stealth", sayolaParams)).toBe(9);
  });

  it("acrobatics = DEX (+5) + proficiency (+4) = +9", () => {
    expect(skillModifier("acrobatics", sayolaParams)).toBe(9);
  });

  it("persuasion = CHA (+2), no proficiency = +2", () => {
    expect(skillModifier("persuasion", sayolaParams)).toBe(2);
  });

  it("insight = WIS (+3) + proficiency (+4) = +7", () => {
    expect(skillModifier("insight", sayolaParams)).toBe(7);
  });

  it("throws on unknown skill", () => {
    expect(() => skillModifier("hacking", sayolaParams)).toThrow("unknown skill");
  });
});

describe("saveModifier", () => {
  it("DEX save = DEX (+5) + proficiency (+4) = +9", () => {
    expect(saveModifier("dex", sayolaParams)).toBe(9);
  });

  it("STR save = STR (+0) + proficiency (+4) = +4", () => {
    expect(saveModifier("str", sayolaParams)).toBe(4);
  });

  it("WIS save = WIS (+3), no proficiency = +3", () => {
    expect(saveModifier("wis", sayolaParams)).toBe(3);
  });
});

describe("abilityCheckModifier", () => {
  it("raw DEX check = +5", () => {
    expect(abilityCheckModifier("dex", sayolaScores)).toBe(5);
  });

  it("raw STR check = +0", () => {
    expect(abilityCheckModifier("str", sayolaScores)).toBe(0);
  });
});

describe("SKILL_TO_ABILITY mapping", () => {
  it("covers all 18 standard D&D skills", () => {
    expect(ALL_SKILLS).toHaveLength(18);
  });

  it("maps each skill to the correct ability", () => {
    expect(SKILL_TO_ABILITY["stealth"]).toBe("dex");
    expect(SKILL_TO_ABILITY["athletics"]).toBe("str");
    expect(SKILL_TO_ABILITY["arcana"]).toBe("int");
    expect(SKILL_TO_ABILITY["perception"]).toBe("wis");
    expect(SKILL_TO_ABILITY["deception"]).toBe("cha");
  });
});
