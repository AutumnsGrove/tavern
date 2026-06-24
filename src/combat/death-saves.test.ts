import { describe, it, expect } from "vitest";
import {
  makeDeathSaveState,
  rollDeathSave,
  damageAtZeroHp,
  healFromZero,
} from "./death-saves";

describe("death saves", () => {
  it("starts with clean state", () => {
    const state = makeDeathSaveState();
    expect(state.successes).toBe(0);
    expect(state.failures).toBe(0);
    expect(state.stable).toBe(false);
    expect(state.dead).toBe(false);
  });

  it("tracks successes and failures over multiple rolls", () => {
    // Run many rolls and verify state transitions
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < 100; i++) {
      const state = makeDeathSaveState();
      let current = { ...state };

      // Roll until resolved
      for (let turn = 0; turn < 10; turn++) {
        const result = rollDeathSave(current);
        current = {
          successes: result.successes,
          failures: result.failures,
          stable: result.stable,
          dead: result.dead,
        };

        if (result.revived || result.stable || result.dead) break;
      }

      if (current.stable) successes++;
      if (current.dead) failures++;
    }

    // Should resolve one way or another in most cases
    expect(successes + failures).toBeGreaterThan(0);
  });

  it("does nothing if already stable", () => {
    const state = { successes: 3, failures: 0, stable: true, dead: false };
    const result = rollDeathSave(state);
    expect(result.nat).toBe(0);
    expect(result.stable).toBe(true);
  });

  it("does nothing if already dead", () => {
    const state = { successes: 0, failures: 3, stable: false, dead: true };
    const result = rollDeathSave(state);
    expect(result.nat).toBe(0);
    expect(result.dead).toBe(true);
  });

  describe("damageAtZeroHp", () => {
    it("adds 1 failure on normal damage", () => {
      const state = makeDeathSaveState();
      const result = damageAtZeroHp(state, false);
      expect(result.failures).toBe(1);
      expect(result.dead).toBe(false);
    });

    it("adds 2 failures on crit damage", () => {
      const state = makeDeathSaveState();
      const result = damageAtZeroHp(state, true);
      expect(result.failures).toBe(2);
    });

    it("marks dead at 3 failures", () => {
      const state = { successes: 1, failures: 2, stable: false, dead: false };
      const result = damageAtZeroHp(state, false);
      expect(result.failures).toBe(3);
      expect(result.dead).toBe(true);
    });
  });

  describe("healFromZero", () => {
    it("resets all counters", () => {
      const result = healFromZero();
      expect(result.successes).toBe(0);
      expect(result.failures).toBe(0);
      expect(result.stable).toBe(false);
      expect(result.dead).toBe(false);
    });
  });
});
