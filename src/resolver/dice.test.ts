import { describe, it, expect } from "vitest";
import {
  rollDie,
  rollDice,
  roll4d6DropLowest,
  rollAbilityScores,
  resolve,
  resolveDamage,
  rollInitiative,
} from "./dice";

describe("rollDie", () => {
  it("returns values in range [1, sides]", () => {
    const sides = [4, 6, 8, 10, 12, 20, 100];
    for (const s of sides) {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(s);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(s);
        expect(Number.isInteger(result)).toBe(true);
      }
    }
  });

  it("d1 always returns 1", () => {
    for (let i = 0; i < 10; i++) {
      expect(rollDie(1)).toBe(1);
    }
  });

  it("rejects invalid sides", () => {
    expect(() => rollDie(0)).toThrow("invalid die");
    expect(() => rollDie(-1)).toThrow("invalid die");
    expect(() => rollDie(1.5)).toThrow("invalid die");
  });

  it("produces varied results for d20 over many rolls", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(rollDie(20));
    }
    // With 200 rolls of a d20, we should see at least 15 distinct values
    expect(seen.size).toBeGreaterThanOrEqual(15);
  });
});

describe("rollDice", () => {
  it("returns the correct number of dice", () => {
    const result = rollDice(4, 6);
    expect(result).toHaveLength(4);
    for (const r of result) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });
});

describe("roll4d6DropLowest", () => {
  it("rolls 4d6, keeps 3, drops the lowest", () => {
    for (let i = 0; i < 50; i++) {
      const { rolls, kept, total } = roll4d6DropLowest();
      expect(rolls).toHaveLength(4);
      expect(kept).toHaveLength(3);
      // Total should be sum of the 3 kept dice
      expect(total).toBe(kept.reduce((a, b) => a + b, 0));
      // Total range: 3 (three 1s) to 18 (three 6s)
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(18);
      // The dropped die should be <= all kept dice
      const sorted = [...rolls].sort((a, b) => a - b);
      expect(kept).toEqual(sorted.slice(1));
    }
  });
});

describe("rollAbilityScores", () => {
  it("produces 6 scores between 3 and 18", () => {
    const { scores, details } = rollAbilityScores();
    expect(scores).toHaveLength(6);
    expect(details).toHaveLength(6);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(18);
    }
  });
});

describe("resolve", () => {
  it("produces results in valid d20 range", () => {
    for (let i = 0; i < 100; i++) {
      const result = resolve({
        type: "check",
        modifier: 5,
        dc: 15,
        reason: "test",
      });
      expect(result.nat).toBeGreaterThanOrEqual(1);
      expect(result.nat).toBeLessThanOrEqual(20);
      expect(result.total).toBe(result.nat + result.modifier);
      expect(result.modifier).toBe(5);
      expect(result.success).toBe(result.total >= 15);
      expect(result.margin).toBe(result.total - 15);
      expect(result.crit).toBe(result.nat === 20);
      expect(result.fumble).toBe(result.nat === 1);
    }
  });

  it("handles advantage (takes higher of two rolls)", () => {
    let sawDifferentRolls = false;
    for (let i = 0; i < 100; i++) {
      const result = resolve({
        type: "check",
        modifier: 0,
        advantage: true,
        reason: "advantage test",
      });
      expect(result.rolls).toHaveLength(2);
      expect(result.advantage).toBe(true);
      expect(result.disadvantage).toBe(false);
      expect(result.nat).toBe(Math.max(result.rolls[0]!, result.rolls[1]!));
      if (result.rolls[0] !== result.rolls[1]) sawDifferentRolls = true;
    }
    expect(sawDifferentRolls).toBe(true);
  });

  it("handles disadvantage (takes lower of two rolls)", () => {
    for (let i = 0; i < 100; i++) {
      const result = resolve({
        type: "check",
        modifier: 0,
        disadvantage: true,
        reason: "disadvantage test",
      });
      expect(result.rolls).toHaveLength(2);
      expect(result.disadvantage).toBe(true);
      expect(result.nat).toBe(Math.min(result.rolls[0]!, result.rolls[1]!));
    }
  });

  it("advantage + disadvantage cancel out", () => {
    for (let i = 0; i < 50; i++) {
      const result = resolve({
        type: "check",
        modifier: 0,
        advantage: true,
        disadvantage: true,
        reason: "cancel test",
      });
      expect(result.rolls).toHaveLength(1);
      expect(result.advantage).toBe(false);
      expect(result.disadvantage).toBe(false);
    }
  });

  it("omits success/margin when no DC provided", () => {
    const result = resolve({
      type: "initiative",
      modifier: 3,
      reason: "initiative",
    });
    expect(result.success).toBeUndefined();
    expect(result.margin).toBeUndefined();
    expect(result.dc).toBeUndefined();
  });
});

describe("resolveDamage", () => {
  it("parses NdX and rolls correct number of dice", () => {
    for (let i = 0; i < 50; i++) {
      const result = resolveDamage({ dice: "2d6", modifier: 3, reason: "longsword" });
      expect(result.rolls).toHaveLength(2);
      expect(result.total).toBe(result.rolls[0]! + result.rolls[1]! + 3);
      expect(result.modifier).toBe(3);
      expect(result.dice).toBe("2d6");
    }
  });

  it("works without a modifier", () => {
    const result = resolveDamage({ dice: "1d8", reason: "rapier" });
    expect(result.rolls).toHaveLength(1);
    expect(result.modifier).toBe(0);
    expect(result.total).toBe(result.rolls[0]!);
  });

  it("rejects invalid notation", () => {
    expect(() => resolveDamage({ dice: "fireball", reason: "bad" })).toThrow(
      "invalid damage notation"
    );
  });
});

describe("rollInitiative", () => {
  it("returns sorted combatants with correct fields", () => {
    const combatants = [
      { name: "Sayola", modifier: 4 },
      { name: "Guard A", modifier: 1 },
      { name: "Guard B", modifier: 1 },
      { name: "Captain", modifier: 3 },
    ];

    const order = rollInitiative(combatants);
    expect(order).toHaveLength(4);

    // Check all names present
    const names = order.map((e) => e.name);
    expect(names).toContain("Sayola");
    expect(names).toContain("Guard A");
    expect(names).toContain("Guard B");
    expect(names).toContain("Captain");

    // Check sorted descending by total
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.total).toBeGreaterThanOrEqual(order[i]!.total);
    }

    // Check math
    for (const entry of order) {
      expect(entry.total).toBe(entry.roll + entry.modifier);
      expect(entry.roll).toBeGreaterThanOrEqual(1);
      expect(entry.roll).toBeLessThanOrEqual(20);
    }
  });
});
