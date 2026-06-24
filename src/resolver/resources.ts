/**
 * Class resource resolver. Reads the SRD Levels data to determine
 * what expendable resources a class/level combination gets.
 *
 * Resources are things that get used up and restored on rest:
 *   ki_points, rage_count, sorcery_points, action_surges,
 *   channel_divinity_charges, spell_slots (per level), etc.
 *
 * Passive scalers (rage_damage_bonus, unarmored_movement, aura_range)
 * are NOT tracked here — they're computed on demand from the SRD.
 */

import type { SrdLoader } from "../srd/loader";

export interface Resource {
  current: number;
  max: number;
  restoresOn: "short" | "long";
}

export type ResourceMap = Record<string, Resource>;

// Resources that restore on short rest (everything else is long rest)
const SHORT_REST_RESOURCES = new Set([
  "ki_points",
  "action_surges",
  "channel_divinity_charges",
  "second_wind",
]);

// Resources to extract from class_specific (expendable, has a max)
const TRACKED_RESOURCES: Record<string, string> = {
  ki_points: "Ki",
  rage_count: "Rage",
  sorcery_points: "Sorcery Points",
  action_surges: "Action Surge",
  channel_divinity_charges: "Channel Divinity",
  indomitable_uses: "Indomitable",
  arcane_recovery_levels: "Arcane Recovery",
};

// Warlock pact magic is special — all slots are the same level and restore on short rest
const WARLOCK_CLASS = "warlock";

export function getResourceLabel(key: string): string {
  if (key.startsWith("spell_slot_")) {
    const level = key.replace("spell_slot_", "");
    return `Spell Slots (${ordinal(parseInt(level, 10))})`;
  }
  return TRACKED_RESOURCES[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]!);
}

/**
 * Build the full resource map for a class at a given level.
 * Reads class_specific and spellcasting from SRD Levels data.
 */
export async function buildResourceMap(
  srd: SrdLoader,
  className: string,
  level: number,
): Promise<ResourceMap> {
  const resources: ResourceMap = {};
  const classLower = className.toLowerCase();

  const levelData = await srd.classLevel(classLower, level);
  if (!levelData) return resources;

  const classSpecific = (levelData as Record<string, unknown>).class_specific as Record<string, unknown> | undefined;
  const spellcasting = (levelData as Record<string, unknown>).spellcasting as Record<string, unknown> | undefined;

  // Extract tracked class-specific resources
  if (classSpecific) {
    for (const [key, label] of Object.entries(TRACKED_RESOURCES)) {
      const value = classSpecific[key];
      if (typeof value === "number" && value > 0) {
        resources[key] = {
          current: value,
          max: value,
          restoresOn: SHORT_REST_RESOURCES.has(key) ? "short" : "long",
        };
      }
    }
  }

  // Extract spell slots
  if (spellcasting) {
    const isWarlock = classLower === WARLOCK_CLASS;

    for (let slotLevel = 1; slotLevel <= 9; slotLevel++) {
      const key = `spell_slots_level_${slotLevel}`;
      const max = spellcasting[key];
      if (typeof max === "number" && max > 0) {
        resources[`spell_slot_${slotLevel}`] = {
          current: max,
          max,
          restoresOn: isWarlock ? "short" : "long",
        };
      }
    }
  }

  return resources;
}

/** Spend a resource. Returns false if insufficient. */
export function spendResource(
  resources: ResourceMap,
  key: string,
  amount: number = 1,
): boolean {
  const r = resources[key];
  if (!r || r.current < amount) return false;
  r.current -= amount;
  return true;
}

/** Restore resources based on rest type. */
export function restoreResources(
  resources: ResourceMap,
  restType: "short" | "long",
): string[] {
  const restored: string[] = [];

  for (const [key, r] of Object.entries(resources)) {
    if (restType === "long" || r.restoresOn === "short") {
      if (r.current < r.max) {
        r.current = r.max;
        restored.push(getResourceLabel(key));
      }
    }
  }

  return restored;
}
