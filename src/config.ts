/**
 * Configuration — all tunable values in one place.
 *
 * Data Primacy: code translates data, it never defines it.
 * If a value could live in a config file, it must.
 */

export const config = {

  // ── Models ──────────────────────────────────────────────────

  /** Default narrator model (OpenRouter model ID) */
  defaultModel: "xiaomi/mimo-v2.5",

  /** Available models for the /model picker */
  availableModels: [
    { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "default" },
    { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "quality" },
    { id: "xiaomi/mimo-v2.5", label: "MiMo v2.5", tier: "cheap" },
    { id: "xiaomi/mimo-v2.5-pro", label: "MiMo v2.5 Pro", tier: "quality" },
    { id: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B MoE", tier: "ultra-cheap" },
  ] as const,

  /**
   * Native provider routing. Forces models to use their native
   * endpoint for best pricing and prompt caching. The native
   * DeepSeek endpoint caches aggressively — cached tokens cost
   * ~4.5x less than uncached.
   */
  providerRouting: {
    "deepseek/deepseek-v4-flash": { order: ["DeepSeek"], allow_fallbacks: false },
    "deepseek/deepseek-v4-pro": { order: ["DeepSeek"], allow_fallbacks: false },
    "xiaomi/mimo-v2.5": { order: ["Xiaomi"], allow_fallbacks: false },
    "xiaomi/mimo-v2.5-pro": { order: ["Xiaomi"], allow_fallbacks: false },
  } as Record<string, { order: string[]; allow_fallbacks: boolean }>,

  /** Per-model pricing ($ per 1M tokens) from OpenRouter */
  modelPricing: {
    "deepseek/deepseek-v4-flash": { input: 0.09, output: 0.18, cachedInput: 0.02 },
    "deepseek/deepseek-v4-pro": { input: 0.435, output: 0.87, cachedInput: 0.003625 },
    "xiaomi/mimo-v2.5": { input: 0.105, output: 0.28, cachedInput: 0.105 },
    "xiaomi/mimo-v2.5-pro": { input: 0.435, output: 0.87, cachedInput: 0.0036 },
    "qwen/qwen3-235b-a22b-2507": { input: 0.09, output: 0.10, cachedInput: 0.018 },
  } as Record<string, { input: number; output: number; cachedInput: number }>,

  /** STT model for voice memos */
  sttModel: "nvidia/parakeet-tdt-0.6b-v3",

  // ── Narrator ────────────────────────────────────────────────

  /** Max tokens for narrator response */
  narratorMaxTokens: 4096,

  /** Narrator temperature (higher = more creative) */
  narratorTemperature: 0.8,

  /** Max tool-calling iterations per turn before force-stop */
  maxToolIterations: 20,

  /** Number of recent messages to include as hot context */
  hotContextMessages: 30,

  /** Max token budget for context (triggers auto-compaction) */
  contextTokenBudget: 12000,

  /** Messages to keep after auto-compaction (most recent) */
  compactionKeepMessages: 10,

  // ── Character Creation ──────────────────────────────────────

  /** Default level for /new when not specified */
  defaultLevel: 3,

  /** Recommended level range shown during onboarding */
  recommendedLevelRange: "3-5",

  // ── Display ─────────────────────────────────────────────────

  /** Default narration mode */
  defaultNarrationMode: "verbose" as "verbose" | "concise",

  /** Default traces visibility */
  defaultTracesEnabled: true,

  /** Max forks the narrator can present (engine appends "Other") */
  maxForks: 5,

  /** Min forks the narrator must present */
  minForks: 3,

} as const;

export type ModelId = typeof config.availableModels[number]["id"];
