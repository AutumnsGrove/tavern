import { describe, it, expect } from "vitest";
import { spendResource, restoreResources, getResourceLabel } from "./resources";
import type { ResourceMap } from "./resources";

describe("resources", () => {
  function makeResources(): ResourceMap {
    return {
      ki_points: { current: 3, max: 5, restoresOn: "short" },
      rage_count: { current: 2, max: 3, restoresOn: "long" },
      spell_slot_1: { current: 4, max: 4, restoresOn: "long" },
      spell_slot_2: { current: 1, max: 2, restoresOn: "long" },
      action_surges: { current: 0, max: 1, restoresOn: "short" },
    };
  }

  describe("spendResource", () => {
    it("spends a resource and decrements", () => {
      const r = makeResources();
      expect(spendResource(r, "ki_points", 2)).toBe(true);
      expect(r["ki_points"]!.current).toBe(1);
    });

    it("defaults to spending 1", () => {
      const r = makeResources();
      expect(spendResource(r, "rage_count")).toBe(true);
      expect(r["rage_count"]!.current).toBe(1);
    });

    it("returns false if insufficient", () => {
      const r = makeResources();
      expect(spendResource(r, "ki_points", 10)).toBe(false);
      expect(r["ki_points"]!.current).toBe(3); // unchanged
    });

    it("returns false if already empty", () => {
      const r = makeResources();
      expect(spendResource(r, "action_surges")).toBe(false);
    });

    it("returns false for unknown resource", () => {
      const r = makeResources();
      expect(spendResource(r, "nonexistent")).toBe(false);
    });
  });

  describe("restoreResources", () => {
    it("short rest restores short-rest resources only", () => {
      const r = makeResources();
      spendResource(r, "ki_points", 3);
      spendResource(r, "rage_count", 1);

      const restored = restoreResources(r, "short");

      expect(r["ki_points"]!.current).toBe(5); // restored
      expect(r["rage_count"]!.current).toBe(1); // NOT restored (long rest)
      expect(r["action_surges"]!.current).toBe(1); // restored
      expect(restored).toContain("Ki");
      expect(restored).toContain("Action Surge");
      expect(restored).not.toContain("Rage");
    });

    it("long rest restores everything", () => {
      const r = makeResources();
      spendResource(r, "ki_points", 3);
      spendResource(r, "rage_count", 2);
      spendResource(r, "spell_slot_1", 4);
      spendResource(r, "spell_slot_2", 1);

      const restored = restoreResources(r, "long");

      expect(r["ki_points"]!.current).toBe(5);
      expect(r["rage_count"]!.current).toBe(3);
      expect(r["spell_slot_1"]!.current).toBe(4);
      expect(r["spell_slot_2"]!.current).toBe(2);
      expect(r["action_surges"]!.current).toBe(1);
    });

    it("returns empty array if nothing to restore", () => {
      const r = makeResources();
      // Set all short-rest resources to full
      r.ki_points!.current = 5;
      r.action_surges!.current = 1;
      const restored = restoreResources(r, "short");
      expect(restored).toEqual([]);
    });
  });

  describe("getResourceLabel", () => {
    it("maps known keys to labels", () => {
      expect(getResourceLabel("ki_points")).toBe("Ki");
      expect(getResourceLabel("rage_count")).toBe("Rage");
      expect(getResourceLabel("sorcery_points")).toBe("Sorcery Points");
    });

    it("formats spell slot keys", () => {
      expect(getResourceLabel("spell_slot_1")).toBe("Spell Slots (1st)");
      expect(getResourceLabel("spell_slot_3")).toBe("Spell Slots (3rd)");
    });

    it("title-cases unknown keys", () => {
      expect(getResourceLabel("wild_shape_charges")).toBe("Wild Shape Charges");
    });
  });
});
