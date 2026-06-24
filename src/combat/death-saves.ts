/**
 * Death saving throw system. Pure engine logic — the LLM never
 * decides if you live or die.
 *
 * Rules:
 *   - At 0 HP: unconscious, death saves begin
 *   - DC 10, no modifiers (flat d20)
 *   - 3 successes → stabilized
 *   - 3 failures → dead
 *   - Nat 20 → regain 1 HP, reset counters
 *   - Nat 1 → counts as 2 failures
 *   - Taking damage at 0 HP → 1 failure (crit → 2)
 *   - Any healing → reset counters, regain consciousness
 */

import { rollDie } from "../resolver/dice";

export interface DeathSaveState {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
}

export interface DeathSaveResult {
  nat: number;
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
  revived: boolean;
}

export function makeDeathSaveState(): DeathSaveState {
  return { successes: 0, failures: 0, stable: false, dead: false };
}

export function rollDeathSave(state: DeathSaveState): DeathSaveResult {
  if (state.stable || state.dead) {
    return { nat: 0, ...state, revived: false };
  }

  const nat = rollDie(20);

  // Nat 20: regain 1 HP, reset everything
  if (nat === 20) {
    return {
      nat,
      successes: 0,
      failures: 0,
      stable: false,
      dead: false,
      revived: true,
    };
  }

  // Nat 1: two failures
  if (nat === 1) {
    const failures = state.failures + 2;
    return {
      nat,
      successes: state.successes,
      failures,
      stable: false,
      dead: failures >= 3,
      revived: false,
    };
  }

  // DC 10
  if (nat >= 10) {
    const successes = state.successes + 1;
    return {
      nat,
      successes,
      failures: state.failures,
      stable: successes >= 3,
      dead: false,
      revived: false,
    };
  }

  // Failed
  const failures = state.failures + 1;
  return {
    nat,
    successes: state.successes,
    failures,
    stable: false,
    dead: failures >= 3,
    revived: false,
  };
}

/** Taking damage at 0 HP. Returns updated state. */
export function damageAtZeroHp(state: DeathSaveState, isCrit: boolean): DeathSaveState {
  const added = isCrit ? 2 : 1;
  const failures = state.failures + added;
  return {
    ...state,
    failures,
    dead: failures >= 3,
  };
}

/** Any healing resets the death save counters. */
export function healFromZero(): DeathSaveState {
  return { successes: 0, failures: 0, stable: false, dead: false };
}
