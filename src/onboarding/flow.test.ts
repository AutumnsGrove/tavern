import { describe, it, expect } from "vitest";
import { startOnboarding, advanceOnboarding } from "./flow";
import type { OnboardingState } from "./flow";

// Mock SRD loader
function mockSrd() {
  const raceData: Record<string, unknown> = {
    human: {
      index: "human", name: "Human", speed: 30,
      ability_bonuses: [
        { ability_score: { index: "str", name: "STR" }, bonus: 1 },
        { ability_score: { index: "dex", name: "DEX" }, bonus: 1 },
        { ability_score: { index: "con", name: "CON" }, bonus: 1 },
        { ability_score: { index: "int", name: "INT" }, bonus: 1 },
        { ability_score: { index: "wis", name: "WIS" }, bonus: 1 },
        { ability_score: { index: "cha", name: "CHA" }, bonus: 1 },
      ],
      traits: [],
    },
    tiefling: {
      index: "tiefling", name: "Tiefling", speed: 30,
      ability_bonuses: [
        { ability_score: { index: "int", name: "INT" }, bonus: 1 },
        { ability_score: { index: "cha", name: "CHA" }, bonus: 2 },
      ],
      traits: [{ name: "Darkvision" }, { name: "Hellish Resistance" }],
    },
  };

  const classData: Record<string, unknown> = {
    monk: {
      index: "monk", name: "Monk", hit_die: 8,
      saving_throws: [{ index: "str", name: "STR" }, { index: "dex", name: "DEX" }],
      subclasses: [{ index: "open-hand", name: "Open Hand" }],
      proficiency_choices: [{
        choose: 2,
        from: {
          options: [
            { item: { index: "skill-acrobatics", name: "Skill: Acrobatics" } },
            { item: { index: "skill-stealth", name: "Skill: Stealth" } },
            { item: { index: "skill-athletics", name: "Skill: Athletics" } },
          ],
        },
      }],
    },
    fighter: {
      index: "fighter", name: "Fighter", hit_die: 10,
      saving_throws: [{ index: "str", name: "STR" }, { index: "con", name: "CON" }],
      subclasses: [{ index: "champion", name: "Champion" }],
      proficiency_choices: [{
        choose: 2,
        from: {
          options: [
            { item: { index: "skill-athletics", name: "Skill: Athletics" } },
            { item: { index: "skill-intimidation", name: "Skill: Intimidation" } },
          ],
        },
      }],
    },
  };

  return {
    index: async (cat: string) => {
      if (cat === "race") return ["human", "tiefling"];
      if (cat === "class") return ["fighter", "monk"];
      return [];
    },
    lookup: async <T>(_cat: string, idx: string) => {
      return (raceData[idx] ?? classData[idx] ?? null) as T | null;
    },
    classLevel: async () => null,
    classFeaturesUpToLevel: async () => [],
  } as any;
}

describe("onboarding flow", () => {
  it("starts with race selection", async () => {
    const result = await startOnboarding(mockSrd());
    expect(result.state.step).toBe("race");
    expect(result.text).toContain("Choose Your Race");
    expect(result.forks.length).toBeGreaterThan(0);
    expect(result.done).toBe(false);
  });

  it("advances from race to class", async () => {
    const start = await startOnboarding(mockSrd());
    const result = await advanceOnboarding(start.state, "Tiefling", mockSrd());
    expect(result.state.step).toBe("class");
    expect(result.state.race).toBe("Tiefling");
    expect(result.text).toContain("Choose Your Class");
  });

  it("advances from class to stats", async () => {
    const state: OnboardingState = {
      step: "class",
      race: "Human",
      raceIndex: "human",
    };
    const result = await advanceOnboarding(state, "Fighter", mockSrd());
    expect(result.state.step).toBe("level");
    expect(result.state.class).toBe("Fighter");
    expect(result.text).toContain("Ability Scores Rolled");
    expect(result.state.scores).toBeDefined();
    expect(result.state.scores!.length).toBe(6);
  });

  it("handles reroll", async () => {
    const state: OnboardingState = {
      step: "level",
      race: "Human",
      raceIndex: "human",
      class: "Fighter",
      classIndex: "fighter",
      scores: [10, 10, 10, 10, 10, 10],
      statAssignment: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    };
    const result = await advanceOnboarding(state, "Reroll", mockSrd());
    expect(result.state.step).toBe("level");
    expect(result.text).toContain("Ability Scores Rolled");
    // New scores should be different (probabilistically)
  });

  it("advances through level to name", async () => {
    const state: OnboardingState = {
      step: "level",
      race: "Human",
      raceIndex: "human",
      class: "Fighter",
      classIndex: "fighter",
      scores: [16, 14, 13, 12, 10, 8],
      statAssignment: { str: 16, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
      skillsToChoose: 2,
      availableSkills: ["Athletics", "Intimidation"],
    };

    // Pick level 1 (no subclass)
    const lvlResult = await advanceOnboarding(state, "Level 1", mockSrd());
    expect(lvlResult.state.level).toBe(1);
    // Should go to skills since level < 3
    expect(lvlResult.state.step).toBe("skills");
  });

  it("completes the name step", async () => {
    const state: OnboardingState = {
      step: "name",
      race: "Tiefling",
      raceIndex: "tiefling",
      class: "Monk",
      classIndex: "monk",
      level: 3,
      subclass: "Open Hand",
      scores: [16, 14, 13, 12, 10, 8],
      statAssignment: { dex: 16, wis: 14, con: 13, str: 12, cha: 10, int: 8 },
      skillProficiencies: ["Acrobatics", "Stealth"],
    };

    const result = await advanceOnboarding(state, "Sayola", mockSrd());
    expect(result.done).toBe(true);
    expect(result.state.name).toBe("Sayola");
  });

  it("supports number-based selection", async () => {
    const start = await startOnboarding(mockSrd());
    // Pick by number (1 = first race)
    const result = await advanceOnboarding(start.state, "1", mockSrd());
    expect(result.state.step).toBe("class");
    expect(result.state.race).toBeDefined();
  });
});
