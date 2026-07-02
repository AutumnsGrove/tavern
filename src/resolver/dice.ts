/**
 * Dice engine. Pure functions, cryptographic RNG.
 * The LLM never touches this module — the engine calls it.
 */

/** Roll a single die with the given number of sides. Uses crypto RNG. */
export function rollDie(sides: number): number {
  if (sides < 1 || !Number.isInteger(sides)) {
    throw new Error(`invalid die: d${sides}`);
  }
  if (sides === 1) return 1;

  // Rejection sampling for uniform distribution.
  // For a dN, we find the largest multiple of N that fits in a uint32,
  // then reject any random value >= that threshold to avoid modulo bias.
  const max = 0x100000000; // 2^32
  const threshold = max - (max % sides);

  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= threshold);

  return (value % sides) + 1;
}

/** Roll NdX and return the individual results. */
export function rollDice(count: number, sides: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides));
  }
  return results;
}

/** Roll 4d6, drop lowest. Used for ability score generation. */
export function roll4d6DropLowest(): { rolls: number[]; kept: number[]; total: number } {
  const rolls = rollDice(4, 6);
  const sorted = [...rolls].sort((a, b) => a - b);
  const kept = sorted.slice(1); // drop the lowest
  const total = kept.reduce((sum, n) => sum + n, 0);
  return { rolls, kept, total };
}

/** Roll a full set of 6 ability scores (4d6 drop lowest, x6). */
export function rollAbilityScores(): {
  scores: number[];
  details: Array<{ rolls: number[]; kept: number[]; total: number }>;
} {
  const details = Array.from({ length: 6 }, () => roll4d6DropLowest());
  const scores = details.map((d) => d.total);
  return { scores, details };
}

export interface RollResult {
  nat: number;
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
  crit: boolean;
  fumble: boolean;
  margin?: number;
  advantage: boolean;
  disadvantage: boolean;
  rolls: number[];
  reason: string;
}

export interface ResolveParams {
  type: "check" | "save" | "attack" | "initiative" | "custom";
  modifier: number;
  dc?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  reason: string;
}

/**
 * Resolve a d20-based roll (check, save, attack, initiative).
 * Handles advantage/disadvantage, crits, fumbles, and DC comparison.
 */
export function resolve(params: ResolveParams): RollResult {
  const { type, modifier, dc, reason } = params;
  // Advantage and disadvantage cancel each other out
  const advantage = !!(params.advantage && !params.disadvantage);
  const disadvantage = !!(params.disadvantage && !params.advantage);

  let nat: number;
  let rolls: number[];

  if (advantage || disadvantage) {
    const a = rollDie(20);
    const b = rollDie(20);
    nat = advantage ? Math.max(a, b) : Math.min(a, b);
    rolls = [a, b];
  } else {
    nat = rollDie(20);
    rolls = [nat];
  }

  const total = nat + modifier;
  const crit = nat === 20;
  const fumble = nat === 1;

  let success: boolean | undefined;
  let margin: number | undefined;
  if (dc !== undefined) {
    success = total >= dc;
    margin = total - dc;
  }

  return {
    nat,
    modifier,
    total,
    dc,
    success,
    crit,
    fumble,
    margin,
    advantage,
    disadvantage,
    rolls,
    reason,
  };
}

export interface DamageResult {
  rolls: number[];
  modifier: number;
  total: number;
  dice: string;
  reason: string;
}

/**
 * Resolve a damage roll. Parses notation like "2d6+3" or "1d8".
 */
export function resolveDamage(params: {
  dice: string;
  modifier?: number;
  reason: string;
}): DamageResult {
  const { dice, modifier = 0, reason } = params;

  const match = dice.match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/);
  if (!match) {
    throw new Error(`invalid damage notation: ${dice}`);
  }
  const count = parseInt(match[1]!, 10);
  const sides = parseInt(match[2]!, 10);
  const notationBonus = match[3] ? parseInt(match[3], 10) : 0;

  const rolls = rollDice(count, sides);
  const total = rolls.reduce((sum, n) => sum + n, 0) + modifier + notationBonus;

  return { rolls, modifier, total, dice, reason };
}

export interface InitiativeEntry {
  name: string;
  roll: number;
  modifier: number;
  total: number;
}

/**
 * Roll initiative for a list of combatants. Returns them sorted
 * by total (descending), with ties broken by modifier, then by
 * a second random roll.
 */
export function rollInitiative(
  combatants: Array<{ name: string; modifier: number }>
): InitiativeEntry[] {
  const entries: InitiativeEntry[] = combatants.map((c) => {
    const roll = rollDie(20);
    return {
      name: c.name,
      roll,
      modifier: c.modifier,
      total: roll + c.modifier,
    };
  });

  entries.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.modifier !== a.modifier) return b.modifier - a.modifier;
    // True tie — random tiebreak
    return rollDie(20) - rollDie(20);
  });

  return entries;
}
