#!/usr/bin/env tsx
/**
 * Sim runner. Loads a YAML scenario, seeds a character into a
 * temporary database, and runs each message through the real
 * game pipeline. Generates a markdown report.
 *
 * Usage:
 *   pnpm run sim -- sims/exploration.yaml
 *   pnpm run sim -- sims/exploration.yaml --model deepseek/deepseek-v4-pro
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { createLocalD1 } from "../cli/local-d1";
import { createLocalKV } from "../cli/local-kv";
import { GameStore } from "../state/store";
import { SrdLoader } from "../srd/loader";
import { CommandRegistry } from "../gateway/commands";
import { registerCommands } from "../commands";
import { dispatch } from "../gateway/dispatch";
import type { DispatchDeps } from "../gateway/dispatch";
import { config } from "../config";
import { proficiencyBonus, abilityModifier } from "../resolver/skills";
import { rollAbilityScores } from "../resolver/dice";
import { renderCharacterSheet, renderWorldState } from "../state/documents";
import { compactIfNeeded } from "../engine/compaction";
import type { ChatMessage } from "../narrator/client";
import { renderReport } from "./report";
import type { SimSuite, SimMessage, SimTurnResult, SimRunResult } from "./types";

const CHAT_ID = "sim";
const RESULTS_DIR = join(import.meta.dirname, "../../sims/results");

function loadApiKey(): string {
  const devVarsPath = join(import.meta.dirname, "../../.dev.vars");
  if (existsSync(devVarsPath)) {
    const content = readFileSync(devVarsPath, "utf-8");
    const match = content.match(/OPENROUTER_API_KEY=(.+)/);
    if (match) return match[1]!.trim();
  }
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  return "";
}

function parseArgs(): { suitePaths: string[]; modelOverride?: string } {
  const args = process.argv.slice(2);
  const suitePaths: string[] = [];
  let modelOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      modelOverride = args[++i];
    } else {
      const path = args[i]!;
      if (existsSync(path)) {
        const stat = statSync(path);
        if (stat.isDirectory()) {
          const yamls = readdirSync(path)
            .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
            .map((f) => join(path, f));
          suitePaths.push(...yamls);
        } else {
          suitePaths.push(path);
        }
      } else {
        console.error(`File not found: ${path}`);
        process.exit(1);
      }
    }
  }

  if (suitePaths.length === 0) {
    console.error("Usage: pnpm run sim -- <path-to-yaml> [--model <model-id>]");
    process.exit(1);
  }

  return { suitePaths, modelOverride };
}

function loadSuite(path: string): SimSuite {
  const raw = readFileSync(path, "utf-8");
  return parseYaml(raw) as SimSuite;
}

function messageText(msg: SimMessage): string {
  return typeof msg === "string" ? msg : msg.text;
}

function messageDelay(msg: SimMessage): number {
  return typeof msg === "string" ? 0 : (msg.delay ?? 0);
}

async function seedCharacter(
  store: GameStore,
  srd: SrdLoader,
  saveId: string,
  charDef: SimSuite["character"],
): Promise<void> {
  const stats = charDef.stats ?? rollDefaultStats();
  const level = charDef.level;
  const conMod = abilityModifier(stats.con);
  const profBonus = proficiencyBonus(level);

  // Rough HP: hit die average * level + CON mod * level
  const hitDieMap: Record<string, number> = {
    barbarian: 12, fighter: 10, paladin: 10, ranger: 10,
    bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
    sorcerer: 6, wizard: 6,
  };
  const hitDie = hitDieMap[charDef.class.toLowerCase()] ?? 8;
  const hpMax = hitDie + conMod + (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod);

  // Basic AC (10 + DEX mod, monk gets WIS)
  const dexMod = abilityModifier(stats.dex);
  const wisMod = abilityModifier(stats.wis);
  let ac = 10 + dexMod;
  if (charDef.class.toLowerCase() === "monk") {
    ac = 10 + dexMod + wisMod;
  }

  const skillProfs = charDef.skill_proficiencies ?? [];
  const saveProfs = charDef.save_proficiencies ?? [];

  // Ki for monks
  let kiMax: number | null = null;
  let kiCurrent: number | null = null;
  if (charDef.class.toLowerCase() === "monk" && level >= 2) {
    kiMax = level;
    kiCurrent = level;
  }

  await store.createCharacter({
    save_id: saveId,
    name: charDef.name,
    race: charDef.race,
    class: charDef.class,
    subclass: charDef.subclass ?? null,
    level,
    xp: 0,
    str: stats.str, dex: stats.dex, con: stats.con,
    int: stats.int, wis: stats.wis, cha: stats.cha,
    hp_current: hpMax,
    hp_max: hpMax,
    ac,
    speed: 30,
    proficiency_bonus: profBonus,
    ki_current: kiCurrent,
    ki_max: kiMax,
    spell_slots_json: null,
    hit_dice_remaining: level,
    class_resources_json: "{}",
    skill_proficiencies: JSON.stringify(skillProfs),
    save_proficiencies: JSON.stringify(saveProfs),
    tool_proficiencies: "[]",
  });

  // Seed inventory
  if (charDef.inventory) {
    for (const item of charDef.inventory) {
      await store.addItem(saveId, item);
    }
  }

  // Render initial documents
  const character = await store.getCharacter(saveId);
  const inventory = await store.getInventory(saveId);
  if (character) {
    const sheet = renderCharacterSheet(character, inventory);
    await store.setDocument(saveId, "character", sheet);
  }
  const worldDoc = renderWorldState([], [], []);
  await store.setDocument(saveId, "world", worldDoc);
}

function rollDefaultStats(): { str: number; dex: number; con: number; int: number; wis: number; cha: number } {
  const { scores } = rollAbilityScores();
  return { str: scores[0]!, dex: scores[1]!, con: scores[2]!, int: scores[3]!, wis: scores[4]!, cha: scores[5]! };
}

async function runSuite(
  suite: SimSuite,
  apiKey: string,
  modelOverride?: string,
): Promise<SimRunResult> {
  const model = modelOverride ?? suite.model ?? config.defaultModel;
  const dbPath = join(import.meta.dirname, `../../sims/results/.sim-${Date.now()}.db`);

  // Set up isolated database
  const db = createLocalD1(dbPath);
  const kv = createLocalKV();

  // Run migrations
  const migrationSql = readFileSync(
    join(import.meta.dirname, "../state/migrations/001_initial.sql"),
    "utf-8",
  );
  await db.exec(migrationSql);
  try {
    const migration002 = readFileSync(
      join(import.meta.dirname, "../state/migrations/002_class_resources.sql"),
      "utf-8",
    );
    await db.exec(migration002);
  } catch { /* column already exists */ }

  const store = new GameStore(db);
  const srd = new SrdLoader(kv);
  const commands = new CommandRegistry();
  registerCommands(commands, store, srd);

  // Apply settings overrides
  if (suite.settings) {
    const patch: Record<string, unknown> = { model };
    if (suite.settings.narration_mode) patch.narration_mode = suite.settings.narration_mode;
    if (suite.settings.traces_enabled !== undefined) patch.traces_enabled = suite.settings.traces_enabled ? 1 : 0;
    await store.updateSettings(CHAT_ID, patch);
  } else {
    await store.updateSettings(CHAT_ID, { model });
  }

  // Create save and seed character
  const saveId = `sim-${Date.now()}`;
  await store.createSave(saveId, CHAT_ID, suite.name);

  await seedCharacter(store, srd, saveId, suite.character);

  // Seed opening scenario as an assistant message
  if (suite.scenario) {
    await store.addMessage(saveId, { role: "assistant", content: suite.scenario });
  }

  const deps: DispatchDeps = { store, srd, commands, apiKey };

  // Run each message through the pipeline
  const turns: SimTurnResult[] = [];
  const maxTurns = suite.settings?.max_turns ?? suite.messages.length;
  const startTime = Date.now();

  console.log(`\n  Running: ${suite.name}`);
  console.log(`  Model:   ${model}`);
  console.log(`  Turns:   ${Math.min(maxTurns, suite.messages.length)}`);
  console.log("");

  for (let i = 0; i < Math.min(maxTurns, suite.messages.length); i++) {
    const msg = suite.messages[i]!;
    const text = messageText(msg);
    const delay = messageDelay(msg);

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    const turnStart = Date.now();
    console.log(`  Turn ${i + 1}: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`);

    const result = await dispatch(deps, CHAT_ID, text, {
      onToolCall: (name, args, resultData) => {
        const icon = toolIcon(name);
        const r = resultData as Record<string, unknown>;
        if (name === "think") {
          const thought = String(args.text ?? "").slice(0, 80);
          console.log(`           ${icon} ${thought}${String(args.text ?? "").length > 80 ? "..." : ""}`);
        } else if (name === "reply") {
          const preview = String(args.text ?? "").slice(0, 70);
          console.log(`           ${icon} ${preview}${String(args.text ?? "").length > 70 ? "..." : ""}`);
        } else if (name === "request_roll") {
          const success = r.success === true ? " ✅" : r.success === false ? " ❌" : "";
          console.log(`           ${icon} ${r.reason}: nat ${r.nat} + ${r.modifier} = ${r.total}${r.dc !== undefined ? ` vs DC ${r.dc}` : ""}${success}`);
        } else if (name === "request_damage") {
          console.log(`           ${icon} ${r.reason}: ${r.total} damage`);
        } else if (name === "present_forks") {
          const forks = (args.forks as Array<{ label: string }>) ?? [];
          console.log(`           ${icon} [${forks.map((f) => f.label).join(" | ")}]`);
        } else if (name === "update_world") {
          const scene = String(args.current_scene ?? "").slice(0, 60);
          console.log(`           ${icon} scene: ${scene}${String(args.current_scene ?? "").length > 60 ? "..." : ""}`);
        } else if (name === "update_character") {
          const parts: string[] = [];
          if (args.hp_change !== undefined) parts.push(`hp: ${args.hp_change}`);
          if (args.add_items) parts.push(`+items`);
          if (args.remove_items) parts.push(`-items`);
          if (args.spend_resource) parts.push(`spend`);
          console.log(`           ${icon} ${parts.join(", ") || "update"}`);
        } else if (name === "end_scene") {
          console.log(`           ${icon} scene end: ${String(args.summary ?? "").slice(0, 60)}`);
        } else if (name === "start_combat") {
          console.log(`           ${icon} combat started`);
        } else if (name === "enemy_action") {
          console.log(`           ${icon} ${args.enemy}: ${args.action}`);
        } else if (name === "done") {
          // silent
        } else {
          console.log(`           ${icon} ${name}`);
        }
      },
    });

    const turnDuration = Date.now() - turnStart;

    turns.push({
      turnNumber: i + 1,
      input: text,
      reply: result.text,
      forks: result.forks ?? [],
      traceLines: result.traceLines ?? [],
      toolCalls: result.toolCalls ?? [],
      errors: result.error ? [result.error] : [],
      tokensIn: result.tokensIn ?? 0,
      tokensOut: result.tokensOut ?? 0,
      cost: result.cost ?? 0,
      cachedTokens: result.cachedTokens ?? 0,
      model: result.model ?? model,
      iterations: result.iterations ?? 0,
      durationMs: turnDuration,
    });

    const status = result.kind === "error" ? "ERROR" : "ok";
    const tokenInfo = result.tokensIn ? ` (${result.tokensIn}↓ ${result.tokensOut}↑)` : "";
    console.log(`           → ${status} · ${(turnDuration / 1000).toFixed(1)}s${tokenInfo}`);

    // Force compaction after specified turn
    const compactAfter = suite.settings?.compact_after ?? 0;
    if (compactAfter > 0 && (i + 1) === compactAfter) {
      // Use compactOnSceneEnd which trims to keepRecent — force keep only 2
      const { compactOnSceneEnd } = await import("../engine/compaction");
      const compResult = await compactOnSceneEnd(store, saveId, 2);
      if (compResult.trimmedCount > 0) {
        console.log(`           📎 Compaction: trimmed ${compResult.trimmedCount} messages`);
      } else {
        console.log(`           📎 Compaction triggered but nothing to trim`);
      }
    }

    // If result has forks and next message is a fork pick, resolve it
    if (result.forks && result.forks.length > 0 && i + 1 < suite.messages.length) {
      const nextMsg = suite.messages[i + 1]!;
      if (typeof nextMsg !== "string" && nextMsg.pick_fork !== undefined) {
        const forkIdx = nextMsg.pick_fork - 1;
        if (forkIdx >= 0 && forkIdx < result.forks.length) {
          suite.messages[i + 1] = result.forks[forkIdx]!.detail;
        }
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  // Calculate totals
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCost = 0;
  let totalCachedTokens = 0;
  for (const t of turns) {
    totalTokensIn += t.tokensIn;
    totalTokensOut += t.tokensOut;
    totalCost += t.cost;
    totalCachedTokens += t.cachedTokens;
  }

  // Fallback to estimated cost if API didn't return cost
  if (totalCost === 0) {
    const pricing = config.modelPricing[model];
    if (pricing) {
      totalCost = (totalTokensIn / 1_000_000) * pricing.input
                + (totalTokensOut / 1_000_000) * pricing.output;
    }
  }

  const cacheNote = totalCachedTokens > 0 ? ` · ${totalCachedTokens} cached` : "";
  console.log(`\n  Done: ${turns.length} turns · ${totalTokensIn}↓ ${totalTokensOut}↑ tokens${cacheNote} · $${totalCost.toFixed(4)} · ${(totalDuration / 1000).toFixed(1)}s`);

  // Clean up temp DB
  try { unlinkSync(dbPath); } catch { /* ok */ }
  try { unlinkSync(dbPath + "-shm"); } catch { /* ok */ }
  try { unlinkSync(dbPath + "-wal"); } catch { /* ok */ }

  return {
    suite,
    turns,
    totalTokensIn,
    totalTokensOut,
    totalCost,
    totalCachedTokens,
    totalDurationMs: totalDuration,
    model,
    timestamp: new Date(),
  };
}

function toolIcon(name: string): string {
  switch (name) {
    case "think": return "🧠";
    case "reply": return "📝";
    case "done": return "✅";
    case "request_roll": return "🎲";
    case "request_damage": return "💥";
    case "present_forks": return "🔀";
    case "update_character": return "📊";
    case "update_world": return "🌍";
    case "get_character": return "📋";
    case "get_world": return "🗺️";
    case "lookup_rule": return "📖";
    case "start_combat": return "⚔️";
    case "end_combat": return "🏳️";
    case "enemy_action": return "👹";
    case "end_scene": return "📜";
    default: return "🔧";
  }
}

async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error("No OPENROUTER_API_KEY found. Set it in .dev.vars or as an env var.");
    process.exit(1);
  }

  const { suitePaths, modelOverride } = parseArgs();

  for (const suitePath of suitePaths) {
    const suite = loadSuite(suitePath);
    const result = await runSuite(suite, apiKey, modelOverride);

    // Write report
    const report = renderReport(result);
    const suiteName = basename(suitePath, extname(suitePath));
    const runId = Date.now();
    const reportPath = join(RESULTS_DIR, `${suiteName}-${runId}.md`);
    writeFileSync(reportPath, report, "utf-8");
    console.log(`  Report: ${reportPath}\n`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
