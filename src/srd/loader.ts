/**
 * SRD data loader. Abstracts storage backend:
 * - Production: reads from KV, caches in memory
 * - Local dev: same (Miniflare provides local KV)
 *
 * KV key scheme: "srd:{category}:{index}"
 *   e.g. "srd:class:monk", "srd:spell:fireball", "srd:monster:goblin"
 *
 * Category indices stored as: "srd:{category}:_index"
 *   e.g. "srd:class:_index" → ["barbarian","bard","cleric",...]
 */

export type SrdCategory =
  | "class"
  | "subclass"
  | "race"
  | "subrace"
  | "level"
  | "feature"
  | "trait"
  | "spell"
  | "monster"
  | "equipment"
  | "condition"
  | "skill"
  | "ability_score"
  | "weapon_property"
  | "proficiency";

export class SrdLoader {
  private kv: KVNamespace;
  private cache: Map<string, unknown> = new Map();

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /** Look up a single entry by category and index (e.g. "class", "monk"). */
  async lookup<T = unknown>(category: SrdCategory, index: string): Promise<T | null> {
    const key = `srd:${category}:${index}`;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;

    const value = await this.kv.get<T>(key, "json");
    if (value !== null) {
      this.cache.set(key, value);
    }
    return value;
  }

  /** Get the index (list of all entry keys) for a category. */
  async index(category: SrdCategory): Promise<string[]> {
    const key = `srd:${category}:_index`;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as string[];

    const value = await this.kv.get<string[]>(key, "json");
    const result = value ?? [];
    this.cache.set(key, result);
    return result;
  }

  /** Get all entries for a category. */
  async all<T = unknown>(category: SrdCategory): Promise<T[]> {
    const indices = await this.index(category);
    const results: T[] = [];
    for (const idx of indices) {
      const entry = await this.lookup<T>(category, idx);
      if (entry) results.push(entry);
    }
    return results;
  }

  /**
   * Get all level entries for a specific class.
   * Levels are keyed as "srd:level:{class}-{level}" e.g. "srd:level:monk-5"
   */
  async classLevels<T = unknown>(classIndex: string): Promise<T[]> {
    const levels: T[] = [];
    for (let i = 1; i <= 20; i++) {
      const entry = await this.lookup<T>("level", `${classIndex}-${i}`);
      if (entry) levels.push(entry);
    }
    return levels;
  }

  /**
   * Get the level entry for a specific class at a specific level.
   */
  async classLevel<T = unknown>(classIndex: string, level: number): Promise<T | null> {
    return this.lookup<T>("level", `${classIndex}-${level}`);
  }

  /**
   * Get all features for a specific class at or below a given level.
   * Reads from the features data, filtering by class reference.
   */
  async classFeaturesUpToLevel(classIndex: string, level: number): Promise<unknown[]> {
    const allLevels = await this.classLevels<{
      level: number;
      features: Array<{ index: string; name: string }>;
    }>(classIndex);

    const featureRefs = allLevels
      .filter((l) => l.level <= level)
      .flatMap((l) => l.features);

    const features: unknown[] = [];
    for (const ref of featureRefs) {
      const feature = await this.lookup("feature", ref.index);
      if (feature) features.push(feature);
    }
    return features;
  }

  /** Clear the in-memory cache (useful for testing). */
  clearCache(): void {
    this.cache.clear();
  }
}
