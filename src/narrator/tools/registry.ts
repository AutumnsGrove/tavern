/**
 * Tool registry. Progressive loading à la her-go: hot tools are
 * always present, combat tools only load when combat is active.
 * Saves ~1K tokens/turn outside combat.
 */

import type { ToolDef } from "../client";

import { definition as think } from "./think";
import { definition as reply } from "./reply";
import { definition as presentForks } from "./present-forks";
import { definition as done } from "./done";
import { definition as requestRoll } from "./request-roll";
import { definition as requestDamage } from "./request-damage";
import { definition as lookupRule } from "./lookup-rule";
import { definition as getCharacter } from "./get-character";
import { definition as getWorld } from "./get-world";
import { definition as updateCharacter } from "./update-character";
import { definition as updateWorld } from "./update-world";
import { definition as startCombat } from "./start-combat";
import { definition as endCombat } from "./end-combat";
import { definition as enemyAction } from "./enemy-action";
import { definition as endScene } from "./end-scene";

/** Hot tools — always present regardless of game state. */
const HOT_TOOLS: ToolDef[] = [
  think,
  reply,
  presentForks,
  done,
  requestRoll,
  requestDamage,
  lookupRule,
  getCharacter,
  getWorld,
  updateCharacter,
  updateWorld,
  endScene,
  startCombat,
];

/** Combat-only tools — loaded when combat state is active. */
const COMBAT_TOOLS: ToolDef[] = [
  endCombat,
  enemyAction,
];

/** All tools (for tests and backward compat). */
export const ALL_TOOLS: ToolDef[] = [...HOT_TOOLS, ...COMBAT_TOOLS];

/**
 * Get the active tool set for this turn.
 * Combat tools only appear when combat is active.
 */
export function getActiveTools(inCombat: boolean): ToolDef[] {
  return inCombat ? [...HOT_TOOLS, ...COMBAT_TOOLS] : HOT_TOOLS;
}

/** Look up a tool definition by name. */
export function getToolDef(name: string): ToolDef | undefined {
  return ALL_TOOLS.find((t) => t.function.name === name);
}

/** Get all tool names. */
export function getToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.function.name);
}
