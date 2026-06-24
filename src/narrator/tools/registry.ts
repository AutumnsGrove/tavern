/**
 * Tool registry. Collects all tool definitions from individual files.
 * Adding a new tool = create a file, add one import here.
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

/** All narrator tool definitions, in the order they appear in the prompt. */
export const ALL_TOOLS: ToolDef[] = [
  // Control
  think,
  reply,
  presentForks,
  done,
  // Dice & mechanics
  requestRoll,
  requestDamage,
  lookupRule,
  // State
  getCharacter,
  getWorld,
  updateCharacter,
  updateWorld,
  // Combat
  startCombat,
  endCombat,
  enemyAction,
  // Scene
  endScene,
];

/** Look up a tool definition by name. */
export function getToolDef(name: string): ToolDef | undefined {
  return ALL_TOOLS.find((t) => t.function.name === name);
}

/** Get all tool names. */
export function getToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.function.name);
}
