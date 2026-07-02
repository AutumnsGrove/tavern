/**
 * Sim scenario YAML schema. Defines the shape of a sim definition
 * file: character to seed, scenario setup, messages to send,
 * and optional settings overrides.
 */

import type { Fork } from "../gateway/types";

/** Top-level YAML structure for a sim scenario. */
export interface SimSuite {
  name: string;
  description?: string;
  tags?: string[];

  /** Model override for this sim (uses config default if omitted). */
  model?: string;

  /** Pre-built character to seed into the DB. */
  character: SimCharacter;

  /** Opening scenario text — injected as the first "narrator" message. */
  scenario?: string;

  /** Ordered list of player messages to send through the pipeline. */
  messages: SimMessage[];

  /** Per-sim settings overrides. */
  settings?: SimSettings;
}

/** Character definition for seeding. */
export interface SimCharacter {
  name: string;
  race: string;
  class: string;
  subclass?: string;
  level: number;
  /** If omitted, stats are auto-generated via 4d6-drop-lowest. */
  stats?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  /** Skill proficiency names (e.g. ["stealth", "acrobatics"]). */
  skill_proficiencies?: string[];
  /** Save proficiency abilities (e.g. ["str", "dex"]). */
  save_proficiencies?: string[];
  /** Starting inventory items. */
  inventory?: Array<{ name: string; qty?: number; category?: string }>;
}

/** A message in the sim script. Can be a plain string or structured. */
export type SimMessage = string | {
  text: string;
  /** If true, pick this fork number from the previous turn's forks. */
  pick_fork?: number;
  /** Delay in ms before sending (for rate limiting). */
  delay?: number;
};

/** Settings overrides for the sim run. */
export interface SimSettings {
  narration_mode?: "verbose" | "concise";
  traces_enabled?: boolean;
  max_turns?: number;
  /** Force compaction after this turn number (0 = disabled). */
  compact_after?: number;
}

export interface SimToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** Per-turn result captured by the sim runner. */
export interface SimTurnResult {
  turnNumber: number;
  input: string;
  reply: string;
  forks: Fork[];
  traceLines: string[];
  toolCalls: SimToolCall[];
  errors: string[];
  tokensIn: number;
  tokensOut: number;
  cost: number;
  cachedTokens: number;
  model: string;
  iterations: number;
  durationMs: number;
}

/** Full sim run result. */
export interface SimRunResult {
  suite: SimSuite;
  turns: SimTurnResult[];
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  totalCachedTokens: number;
  totalDurationMs: number;
  model: string;
  timestamp: Date;
}
