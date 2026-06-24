import { describe, it, expect } from "vitest";

describe("turn handler integration", () => {
  it("resolve produces valid results for stealth check", async () => {
    // Test that the resolver wiring works correctly
    const { resolve } = await import("../resolver/dice");
    const { skillModifier } = await import("../resolver/skills");
    const { SKILL_TO_ABILITY } = await import("../resolver/skills");

    // Sayola's stats
    const params = {
      scores: { str: 10, dex: 20, con: 12, int: 10, wis: 16, cha: 14 },
      level: 10,
      skillProficiencies: ["stealth", "acrobatics"],
      saveProficiencies: ["str" as const, "dex" as const],
    };

    const mod = skillModifier("stealth", params);
    expect(mod).toBe(9); // DEX(+5) + prof(+4)

    const result = resolve({
      type: "check",
      modifier: mod,
      dc: 15,
      reason: "sneak past guard",
    });

    expect(result.nat).toBeGreaterThanOrEqual(1);
    expect(result.nat).toBeLessThanOrEqual(20);
    expect(result.total).toBe(result.nat + 9);
    expect(result.success).toBe(result.total >= 15);
    expect(result.reason).toBe("sneak past guard");
  });

  it("damage resolver handles dice notation", async () => {
    const { resolveDamage } = await import("../resolver/dice");

    const result = resolveDamage({
      dice: "1d6",
      modifier: 5,
      reason: "unarmed strike",
    });

    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]!).toBeGreaterThanOrEqual(1);
    expect(result.rolls[0]!).toBeLessThanOrEqual(6);
    expect(result.total).toBe(result.rolls[0]! + 5);
  });

  it("context builder includes documents in system prompt", async () => {
    const { buildContext } = await import("./context");

    const messages = buildContext({
      narrationMode: "verbose",
      characterSheet: "# Sayola\nHP: 18/18\nStealth: +9",
      worldState: "# World\nScene: dark alley",
      combatState: "Round 1. Sayola's turn.",
      recentMessages: [
        { role: "user", content: "I sneak forward." },
        { role: "assistant", content: "Roll for stealth." },
      ],
      playerMessage: "Okay, rolling.",
    });

    const system = messages[0]!;
    expect(system.content).toContain("Sayola");
    expect(system.content).toContain("Stealth: +9");
    expect(system.content).toContain("dark alley");
    expect(system.content).toContain("Round 1");
    expect(system.content).toContain("COMBAT (active)");

    // History preserved in order
    expect(messages[1]!.content).toBe("I sneak forward.");
    expect(messages[2]!.content).toBe("Roll for stealth.");
    expect(messages[3]!.content).toBe("Okay, rolling.");
  });

  it("attack modifier uses max(DEX, STR) + proficiency for monks", async () => {
    const { abilityModifier, proficiencyBonus } = await import("../resolver/skills");

    // Sayola: DEX 20 (+5), STR 10 (+0), level 10 (prof +4)
    const dexMod = abilityModifier(20);
    const strMod = abilityModifier(10);
    const prof = proficiencyBonus(10);

    const attackMod = Math.max(dexMod, strMod) + prof;
    expect(attackMod).toBe(9); // +5 DEX + 4 prof
  });

  it("HP clamping works correctly", () => {
    // Simulate the hp_change logic from update_character
    const hp_current = 18;
    const hp_max = 18;

    // Damage
    const afterDamage = Math.max(0, Math.min(hp_max, hp_current + (-5)));
    expect(afterDamage).toBe(13);

    // Overkill
    const afterOverkill = Math.max(0, Math.min(hp_max, hp_current + (-25)));
    expect(afterOverkill).toBe(0);

    // Healing capped at max
    const afterOverheal = Math.max(0, Math.min(hp_max, 10 + 15));
    expect(afterOverheal).toBe(18);

    // Healing from partial
    const afterHeal = Math.max(0, Math.min(hp_max, 10 + 5));
    expect(afterHeal).toBe(15);
  });
});
