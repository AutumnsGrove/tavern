/**
 * Local KV wrapper. Reads SRD JSON files from disk and serves
 * them through the KVNamespace interface. No network, no wrangler.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRD_DIR = join(import.meta.dirname, "../srd/data");

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

/**
 * Build a local KV namespace pre-loaded with all SRD data from disk.
 * Keys follow the same scheme as production: srd:{category}:{index}
 */
export function createLocalKV(): KVNamespace {
  const store = new Map<string, string>();

  // Load all SRD files
  for (const [filename, category] of Object.entries(FILE_TO_CATEGORY)) {
    try {
      const raw = readFileSync(join(SRD_DIR, filename), "utf-8");
      const entries = JSON.parse(raw) as Array<Record<string, unknown>>;

      const indices: string[] = [];

      for (const entry of entries) {
        let key: string;
        if (category === "level") {
          const classRef = (entry["class"] as Record<string, unknown>)?.["index"];
          key = `${classRef}-${entry["level"]}`;
        } else {
          key = String(entry["index"] ?? "");
        }

        if (key) {
          store.set(`srd:${category}:${key}`, JSON.stringify(entry));
          indices.push(key);
        }
      }

      store.set(`srd:${category}:_index`, JSON.stringify(indices));
    } catch {
      // Skip files that don't exist
    }
  }

  // Return a minimal KVNamespace implementation
  return {
    get(key: string, options?: unknown): Promise<string | null> {
      const val = store.get(key) ?? null;
      if (val && typeof options === "string" && options === "json") {
        return Promise.resolve(JSON.parse(val));
      }
      if (val && typeof options === "object" && options !== null && (options as Record<string, unknown>).type === "json") {
        return Promise.resolve(JSON.parse(val));
      }
      return Promise.resolve(val) as Promise<string | null>;
    },
    put(key: string, value: string): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key: string): Promise<void> {
      store.delete(key);
      return Promise.resolve();
    },
    list(): Promise<{ keys: Array<{ name: string }> }> {
      const keys = Array.from(store.keys()).map((name) => ({ name }));
      return Promise.resolve({ keys });
    },
    getWithMetadata(): Promise<unknown> {
      throw new Error("getWithMetadata not supported in local KV");
    },
  } as unknown as KVNamespace;
}
