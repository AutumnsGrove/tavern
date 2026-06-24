/**
 * Seed KV with SRD data from the downloaded 5e-database JSON files.
 *
 * Reads each JSON file, indexes entries by their `index` field,
 * and writes to local Miniflare KV via the wrangler CLI.
 *
 * Usage: pnpm run srd:seed
 *
 * KV key scheme:
 *   srd:{category}:{index}   → individual entry
 *   srd:{category}:_index    → array of all index keys for the category
 */

import { readFileSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const SRD_DIR = join(import.meta.dirname, "../src/srd/data");

// Map filenames → KV category names
const FILE_TO_CATEGORY: Record<string, string> = {
  "Classes.json": "class",
  "Subclasses.json": "subclass",
  "Races.json": "race",
  "Subraces.json": "subrace",
  "Levels.json": "level",
  "Features.json": "feature",
  "Traits.json": "trait",
  "Spells.json": "spell",
  "Monsters.json": "monster",
  "Equipment.json": "equipment",
  "Conditions.json": "condition",
  "Skills.json": "skill",
  "AbilityScores.json": "ability_score",
  "WeaponProperties.json": "weapon_property",
  "Proficiencies.json": "proficiency",
};

function kvPut(key: string, value: string): void {
  // Write to a temp file to avoid shell escaping nightmares with JSON
  const tmpFile = `/tmp/tavern-srd-${Date.now()}.json`;
  const { writeFileSync, unlinkSync } = require("fs") as typeof import("fs");
  writeFileSync(tmpFile, value);
  try {
    execSync(
      `wrangler kv key put --binding SRD --local "${key}" --path "${tmpFile}"`,
      { cwd: join(import.meta.dirname, ".."), stdio: "pipe" }
    );
  } finally {
    unlinkSync(tmpFile);
  }
}

function getIndex(entry: Record<string, unknown>): string {
  return String(entry["index"] ?? "");
}

function seedCategory(filename: string, category: string): number {
  const filepath = join(SRD_DIR, filename);
  const raw = readFileSync(filepath, "utf-8");
  const entries: Record<string, unknown>[] = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    console.error(`  ⚠ ${filename} is not an array, skipping`);
    return 0;
  }

  const indices: string[] = [];

  for (const entry of entries) {
    let key: string;

    if (category === "level") {
      // Levels are keyed by class-level, e.g. "monk-5"
      const classRef = (entry["class"] as Record<string, unknown>)?.["index"];
      const level = entry["level"];
      key = `${classRef}-${level}`;
    } else {
      key = getIndex(entry);
    }

    if (!key) {
      console.error(`  ⚠ Entry missing index in ${filename}, skipping`);
      continue;
    }

    kvPut(`srd:${category}:${key}`, JSON.stringify(entry));
    indices.push(key);
  }

  // Write the category index
  kvPut(`srd:${category}:_index`, JSON.stringify(indices));

  return entries.length;
}

// Main
console.log("🍺 Seeding SRD data into local KV...\n");

const files = readdirSync(SRD_DIR).filter((f) => f.endsWith(".json"));
let totalEntries = 0;

for (const file of files) {
  const category = FILE_TO_CATEGORY[file];
  if (!category) {
    console.log(`  ⏭ ${file} — no category mapping, skipping`);
    continue;
  }

  const count = seedCategory(file, category);
  console.log(`  ✓ ${category}: ${count} entries`);
  totalEntries += count;
}

console.log(`\n✅ Done. ${totalEntries} entries seeded across ${files.length} categories.`);
