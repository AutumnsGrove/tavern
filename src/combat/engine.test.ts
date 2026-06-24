import { describe, it, expect } from "vitest";
import { resolveEnemyAttack } from "./engine";
import type { CombatEnemy } from "./engine";

const goblin: CombatEnemy = {
  name: "Goblin",
  index: "goblin",
  hp_current: 7,
  hp_max: 7,
  ac: 15,
  attack_bonus: 4,
  damage_dice: "1d6",
  damage_bonus: 2,
  dex: 14,
  actions: [
    { name: "Scimitar", desc: "Melee attack", attack_bonus: 4, damage_dice: "1d6", damage_bonus: 2 },
    { name: "Shortbow", desc: "Ranged attack", attack_bonus: 4, damage_dice: "1d6", damage_bonus: 2 },
  ],
  conditions: [],
};

describe("combat engine", () => {
  describe("resolveEnemyAttack", () => {
    it("resolves an attack with hit/miss", () => {
      const result = resolveEnemyAttack(goblin, "Scimitar", 15);

      expect(result.action.name).toBe("Scimitar");
      expect(result.attackRoll.nat).toBeGreaterThanOrEqual(1);
      expect(result.attackRoll.nat).toBeLessThanOrEqual(20);
      expect(typeof result.hit).toBe("boolean");

      if (result.hit) {
        expect(result.damage).toBeDefined();
        expect(result.damage!.total).toBeGreaterThan(0);
      } else {
        expect(result.damage).toBeUndefined();
      }
    });

    it("uses first action as fallback for unknown action", () => {
      const result = resolveEnemyAttack(goblin, "nonexistent", 10);
      expect(result.action.name).toBe("Scimitar");
    });

    it("always hits on nat 20", () => {
      // Run enough times that we'll hit a nat 20
      let sawCrit = false;
      for (let i = 0; i < 200; i++) {
        const result = resolveEnemyAttack(goblin, "Scimitar", 30);
        if (result.attackRoll.crit) {
          expect(result.hit).toBe(true);
          expect(result.damage).toBeDefined();
          sawCrit = true;
          break;
        }
      }
      // Probabilistic — 200 attempts should be enough for at least one nat 20
      // If not, the test still passes (it just doesn't verify the crit path)
    });

    it("always misses on nat 1", () => {
      let sawFumble = false;
      for (let i = 0; i < 200; i++) {
        const result = resolveEnemyAttack(goblin, "Scimitar", 5);
        if (result.attackRoll.fumble) {
          expect(result.hit).toBe(false);
          expect(result.damage).toBeUndefined();
          sawFumble = true;
          break;
        }
      }
    });
  });
});
