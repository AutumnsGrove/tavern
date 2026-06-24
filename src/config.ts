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
    { id: "xiaomi/mimo-v2.5", label: "MiMo v2.5", tier: "default" },
    { id: "xiaomi/mimo-v2.5-pro", label: "MiMo v2.5 Pro", tier: "quality" },
    { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "cheap" },
    { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "quality" },
    { id: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B MoE", tier: "ultra-cheap" },
  ] as const,

  /** STT model for voice memos */
  sttModel: "openai/whisper-1",

  // ── Narrator ────────────────────────────────────────────────

  /** Max tokens for narrator response */
  narratorMaxTokens: 4096,

  /** Narrator temperature (higher = more creative) */
  narratorTemperature: 0.8,

  /** Max tool-calling iterations per turn before force-stop */
  maxToolIterations: 20,

  /** Number of recent messages to include as hot context */
  hotContextMessages: 30,

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
