/**
 * Turn handler. Wires the narrator loop to real tool handlers
 * backed by the resolver, state store, and SRD loader.
 *
 * This is the function that takes "player said X" and returns
 * "narrator said Y with these forks and this trace."
 */

import type { OutboundMsg, Fork } from "../gateway/types";
import type { GameStore } from "../state/store";
import type { SrdLoader, SrdCategory } from "../srd/loader";
import type { ToolHandler } from "../narrator/loop";
import type { ChatMessage } from "../narrator/client";
import { NarratorClient } from "../narrator/client";
import { runNarratorLoop } from "../narrator/loop";
import { getActiveTools } from "../narrator/tools/registry";
import { buildContext } from "./context";
import { config } from "../config";
import { resolve, resolveDamage } from "../resolver/dice";
import {
  skillModifier,
  saveModifier,
  abilityCheckModifier,
  abilityModifier,
  proficiencyBonus,
} from "../resolver/skills";
import { spendResource, getResourceLabel } from "../resolver/resources";
import type { ResourceMap } from "../resolver/resources";
import { startCombat, resolveEnemyAttack, advanceTurn, damageEnemy, allEnemiesDown } from "../combat/engine";
import { rollDeathSave, makeDeathSaveState, damageAtZeroHp, healFromZero } from "../combat/death-saves";
import type { DeathSaveState } from "../combat/death-saves";
import type { Ability, CharacterScores, ModifierLookupParams } from "../resolver/skills";
import { renderCharacterSheet, renderWorldState } from "../state/documents";
import { TraceBoard } from "../trace/board";
import { setSnapshot } from "../commands/undo";
import { compactIfNeeded, compactOnSceneEnd } from "./compaction";

export interface TurnDeps {
  store: GameStore;
  srd: SrdLoader;
  apiKey: string;
  model: string;
}

export interface TurnInput {
  chatId: string;
  saveId: string;
  text: string;
  narrationMode: "verbose" | "concise";
}

export interface TurnCallbacks {
  onContentDelta?: (delta: string) => void;
  onTrace?: (line: string) => void;
  stream?: boolean;
}

export interface TurnOutput {
  reply: string;
  forks: Fork[];
  traceLines: string[];
  traceBoard: TraceBoard;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  cachedTokens: number;
  model: string;
  iterations: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  error?: string;
}

export async function handleTurn(deps: TurnDeps, input: TurnInput, callbacks?: TurnCallbacks): Promise<TurnOutput> {
  const { store, srd, apiKey, model } = deps;
  const { chatId, saveId, text, narrationMode } = input;

  const trace = new TraceBoard();
  trace.onAdd = (line) => callbacks?.onTrace?.(line);

  // Load current state
  const character = await store.getCharacter(saveId);
  const inventory = await store.getInventory(saveId);
  const npcs = await store.getNpcs(saveId);
  const flags = await store.getFlags(saveId);
  const scenes = await store.getScenes(saveId);
  const combat = await store.getCombat(saveId);
  const recentMessages = await store.getRecentMessages(saveId, config.hotContextMessages);

  // Render documents
  const characterSheet = character
    ? renderCharacterSheet(character, inventory)
    : null;
  const currentSceneDoc = await store.getDocument(saveId, "scene");
  const worldState = renderWorldState(npcs, flags, scenes, currentSceneDoc ?? undefined);

  // Build combat state string if in combat
  let combatState: string | undefined;
  if (combat && combat.state === "active") {
    const order = JSON.parse(combat.initiative_order) as Array<{ name: string; total: number }>;
    const enemies = JSON.parse(combat.enemies_json) as Array<{ name: string; hp_current: number; hp_max: number; ac: number }>;
    combatState = `Round ${combat.round}. Turn: ${order[combat.current_turn]?.name ?? "unknown"}.\n`;
    combatState += `Initiative: ${order.map((e, i) => `${i === combat.current_turn ? "→ " : ""}${e.name} (${e.total})`).join(", ")}\n`;
    combatState += `Enemies: ${enemies.map((e) => `${e.name} ${e.hp_current}/${e.hp_max} HP, AC ${e.ac}`).join("; ")}`;

    // Death saves: auto-roll if player is at 0 HP
    if (character && character.hp_current <= 0) {
      const deathSaveJson = await store.getFlag(saveId, "_death_saves");
      const deathState: DeathSaveState = deathSaveJson
        ? JSON.parse(deathSaveJson)
        : makeDeathSaveState();

      if (!deathState.stable && !deathState.dead) {
        const result = rollDeathSave(deathState);

        await store.addRoll(saveId, {
          checkType: "death_save",
          notation: "1d20",
          nat: result.nat,
          total: result.nat,
          dc: 10,
          success: result.nat >= 10,
          crit: result.nat === 20,
          fumble: result.nat === 1,
          reason: "Death saving throw",
        });

        if (result.revived) {
          // Nat 20: regain 1 HP
          await store.updateCharacter(saveId, { hp_current: 1 });
          character.hp_current = 1;
          await store.deleteFlag(saveId, "_death_saves");
          trace.add("combat", `💀 Death save: **NAT 20!** ${character.name} regains 1 HP!`);
          combatState += `\n\n⚡ ${character.name} rolled a NAT 20 on their death save and regains consciousness with 1 HP!`;
        } else if (result.dead) {
          await store.setFlag(saveId, "_death_saves", JSON.stringify(result));
          trace.add("combat", `💀 Death save: nat ${result.nat} — FAILED (${result.failures}/3). ${character.name} has died.`);
          combatState += `\n\n💀 ${character.name} has failed 3 death saves and is DEAD.`;
        } else if (result.stable) {
          await store.setFlag(saveId, "_death_saves", JSON.stringify(result));
          trace.add("combat", `💀 Death save: nat ${result.nat} — SUCCESS (${result.successes}/3). ${character.name} is stable.`);
          combatState += `\n\n🛡️ ${character.name} has stabilized (3 successful death saves). Still unconscious at 0 HP.`;
        } else {
          await store.setFlag(saveId, "_death_saves", JSON.stringify(result));
          const icon = result.nat >= 10 ? "✅" : "❌";
          const failNote = result.nat === 1 ? " (nat 1 = 2 failures!)" : "";
          trace.add("combat", `💀 Death save: nat ${result.nat} ${icon} — ${result.successes}/3 success, ${result.failures}/3 fail${failNote}`);
          combatState += `\n\nDeath saves: ${result.successes}/3 ✅ ${result.failures}/3 ❌. ${character.name} is unconscious.`;
        }
      } else if (deathState.stable) {
        combatState += `\n\n🛡️ ${character.name} is stable but unconscious at 0 HP.`;
      } else if (deathState.dead) {
        combatState += `\n\n💀 ${character.name} is dead.`;
      }
    }
  }

  // Token-based auto-compaction before building context
  const chatHistoryRaw: ChatMessage[] = recentMessages.map((m) => {
    const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
    if (m.tool_calls_json) {
      msg.tool_calls = JSON.parse(m.tool_calls_json);
    }
    if (m.tool_call_id) {
      msg.tool_call_id = m.tool_call_id;
    }
    return msg;
  });

  const compactionResult = await compactIfNeeded(store, saveId, chatHistoryRaw);
  let chatHistory = chatHistoryRaw;
  if (compactionResult.trimmedCount > 0) {
    // Re-fetch after compaction
    const freshMessages = await store.getRecentMessages(saveId, config.hotContextMessages);
    chatHistory = freshMessages.map((m) => {
      const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
      if (m.tool_calls_json) msg.tool_calls = JSON.parse(m.tool_calls_json);
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      return msg;
    });
    trace.add("meta", `📎 Compacted ${compactionResult.trimmedCount} old messages (token budget)`);
  }

  // Build context
  const messages = buildContext({
    narrationMode,
    characterSheet,
    worldState,
    combatState,
    recentMessages: chatHistory,
    playerMessage: text,
  });

  // Snapshot state for /undo before making changes
  const messageCount = await store.getMessageCount(saveId);
  const maxSeq = recentMessages.length > 0
    ? (recentMessages[recentMessages.length - 1] as { seq?: number }).seq ?? messageCount
    : messageCount;
  if (character) {
    setSnapshot({
      character: {
        hp_current: character.hp_current,
        ki_current: character.ki_current,
        ki_max: character.ki_max,
        spell_slots_json: character.spell_slots_json,
        class_resources_json: character.class_resources_json,
      },
      inventory: inventory.map((i) => ({ ...i })),
      flags: flags.map((f) => ({ ...f })),
      messageSeq: maxSeq,
    });
  }

  // Save the player's message
  await store.addMessage(saveId, { role: "user", content: text });

  // Build tool handlers
  const handlers = buildToolHandlers(store, srd, saveId, character, trace);

  // Run narrator loop
  const client = new NarratorClient({
    apiKey,
    model,
    maxTokens: config.narratorMaxTokens,
    temperature: config.narratorTemperature,
    provider: config.providerRouting[model],
  });
  const inCombat = !!(combat && combat.state === "active");
  const activeTools = getActiveTools(inCombat);

  const result = await runNarratorLoop({
    client,
    tools: activeTools,
    handlers,
    messages,
    maxIterations: config.maxToolIterations,
    stream: callbacks?.stream ?? false,
    onContentDelta: callbacks?.onContentDelta,
    onToolCall: (name, args, resultData) => {
      if (name === "request_roll" || name === "request_damage") {
        const r = resultData as Record<string, unknown>;
        if (r.nat !== undefined) {
          const successIcon = r.success === true ? "✅" : r.success === false ? "❌" : "";
          const critLabel = r.crit ? " *** NAT 20 ***" : r.fumble ? " *** NAT 1 ***" : "";
          trace.add("rolls",
            `🎲 ${r.reason}: nat ${r.nat} ${r.modifier !== undefined ? `+ ${r.modifier}` : ""} = ${r.total}${r.dc !== undefined ? ` vs DC ${r.dc} ${successIcon}` : ""}${critLabel}`
          );
        } else if (r.total !== undefined) {
          trace.add("rolls", `🎲 ${r.reason}: ${r.rolls} + ${r.modifier} = ${r.total} damage`);
        }
      }
    },
  });

  // Save assistant message
  await store.addMessage(saveId, {
    role: "assistant",
    content: result.reply,
    tokensIn: result.totalTokensIn,
    tokensOut: result.totalTokensOut,
    model: result.model,
  });

  // Cost from API (real cost) or estimate from pricing table
  const apiCost = result.totalCost;
  let costStr = "";
  if (apiCost > 0) {
    costStr = ` · $${apiCost.toFixed(4)}`;
  } else {
    const pricing = config.modelPricing[model];
    if (pricing) {
      costStr = ` · ~$${((result.totalTokensIn / 1_000_000) * pricing.input + (result.totalTokensOut / 1_000_000) * pricing.output).toFixed(4)}`;
    }
  }

  // Cache info
  const cacheStr = result.cachedTokens > 0
    ? ` · ${result.cachedTokens} cached`
    : "";

  // Add meta trace
  trace.add("meta",
    `⏱ ${result.iterations} tool calls · ${result.totalTokensIn}↓ ${result.totalTokensOut}↑ tokens${cacheStr}${costStr} · ${result.model}`
  );

  await store.updateSaveTimestamp(saveId);

  return {
    reply: result.reply,
    forks: result.forks,
    traceLines: trace.toLines(),
    traceBoard: trace,
    tokensIn: result.totalTokensIn,
    tokensOut: result.totalTokensOut,
    cost: result.totalCost,
    cachedTokens: result.cachedTokens,
    model: result.model,
    iterations: result.iterations,
    toolCalls: result.toolCalls,
    error: result.error,
  };
}

/** Build the map of tool name → handler function. */
function buildToolHandlers(
  store: GameStore,
  srd: SrdLoader,
  saveId: string,
  character: Awaited<ReturnType<GameStore["getCharacter"]>>,
  trace: TraceBoard,
): Record<string, ToolHandler> {
  return {
    async request_roll(args) {
      if (!character) return { error: "no character loaded" };

      const scores: CharacterScores = {
        str: character.str, dex: character.dex, con: character.con,
        int: character.int, wis: character.wis, cha: character.cha,
      };
      const modParams: ModifierLookupParams = {
        scores,
        level: character.level,
        skillProficiencies: JSON.parse(character.skill_proficiencies) as string[],
        saveProficiencies: JSON.parse(character.save_proficiencies) as Ability[],
      };

      let modifier = 0;
      const type = args.type as string;
      const skill = args.skill as string | undefined;
      const ability = args.ability as Ability | undefined;
      const reason = (args.reason as string) || "unknown check";

      if (type === "check" && skill) {
        modifier = skillModifier(skill, modParams);
      } else if (type === "check" && ability) {
        modifier = abilityCheckModifier(ability, scores);
      } else if (type === "save" && ability) {
        modifier = saveModifier(ability, modParams);
      } else if (type === "attack") {
        // Attack modifier = DEX or STR (monk uses higher) + proficiency
        const dexMod = abilityModifier(character.dex);
        const strMod = abilityModifier(character.str);
        modifier = Math.max(dexMod, strMod) + proficiencyBonus(character.level);
      } else if (type === "initiative") {
        modifier = abilityModifier(character.dex);
      }

      // Ignore any modifier the model tries to pass — engine owns this
      const result = resolve({
        type: type as "check" | "save" | "attack" | "initiative" | "custom",
        modifier,
        dc: args.dc as number | undefined,
        advantage: args.advantage as boolean | undefined,
        disadvantage: args.disadvantage as boolean | undefined,
        reason,
      });

      // Persist the roll
      await store.addRoll(saveId, {
        checkType: skill ?? ability ?? type,
        notation: "1d20",
        modifier: result.modifier,
        dc: result.dc,
        nat: result.nat,
        total: result.total,
        success: result.success,
        crit: result.crit,
        fumble: result.fumble,
        reason,
      });

      return result;
    },

    async request_damage(args) {
      const result = resolveDamage({
        dice: args.dice as string,
        modifier: 0,
        reason: (args.reason as string) || "damage",
      });

      await store.addRoll(saveId, {
        checkType: "damage",
        notation: args.dice as string,
        nat: result.rolls.reduce((a, b) => a + b, 0),
        total: result.total,
        reason: result.reason,
      });

      return result;
    },

    async lookup_rule(args) {
      const category = args.category as SrdCategory;
      const name = args.name as string;
      const entry = await srd.lookup(category, name);
      if (!entry) return { error: `not found: ${category}/${name}` };
      return entry;
    },

    async get_character() {
      if (!character) return { error: "no character" };
      const inv = await store.getInventory(saveId);
      return { character, inventory: inv };
    },

    async get_world() {
      const npcs = await store.getNpcs(saveId);
      const flags = await store.getFlags(saveId);
      const scenes = await store.getScenes(saveId);
      const scene = await store.getDocument(saveId, "scene");
      return { npcs, flags, scenes, currentScene: scene };
    },

    async update_character(args) {
      if (!character) return { error: "no character" };

      const patch: Record<string, unknown> = {};

      if (args.hp_change !== undefined) {
        const hpChange = args.hp_change as number;
        const wasAtZero = character.hp_current <= 0;
        const newHp = Math.max(0, Math.min(character.hp_max, character.hp_current + hpChange));
        patch.hp_current = newHp;
        trace.add("state", `📊 HP: ${character.hp_current} → ${newHp}/${character.hp_max}`);
        character.hp_current = newHp;

        // Healing from 0 HP resets death saves
        if (wasAtZero && newHp > 0) {
          await store.deleteFlag(saveId, "_death_saves");
          trace.add("combat", `💀 Death saves reset — ${character.name} regains consciousness`);
        }
      }

      if (args.ki_change !== undefined && character.ki_current !== null && character.ki_max !== null) {
        const newKi = Math.max(0, Math.min(character.ki_max, character.ki_current + (args.ki_change as number)));
        patch.ki_current = newKi;
        trace.add("state", `📊 Ki: ${character.ki_current} → ${newKi}/${character.ki_max}`);
        character.ki_current = newKi;
      }

      // Spend class resource
      const spendRes = args.spend_resource as { key: string; amount?: number } | undefined;
      if (spendRes) {
        const resources: ResourceMap = JSON.parse(character.class_resources_json || "{}");
        const amount = spendRes.amount ?? 1;
        const success = spendResource(resources, spendRes.key, amount);
        if (!success) {
          return { error: `insufficient ${getResourceLabel(spendRes.key)} (need ${amount})` };
        }
        patch.class_resources_json = JSON.stringify(resources);
        character.class_resources_json = JSON.stringify(resources);
        const r = resources[spendRes.key]!;
        trace.add("state", `📊 ${getResourceLabel(spendRes.key)}: ${r.current + amount} → ${r.current}/${r.max}`);
      }

      if (Object.keys(patch).length > 0) {
        await store.updateCharacter(saveId, patch);
      }

      // Add items
      const addItems = args.add_items as Array<{ name: string; qty?: number; unit?: string; category?: string; notes?: string }> | undefined;
      if (addItems) {
        for (const item of addItems) {
          await store.addItem(saveId, item);
          trace.add("state", `📦 +${item.name}${item.qty && item.qty > 1 ? ` (x${item.qty})` : ""}`);
        }
      }

      // Remove items
      const removeItems = args.remove_items as string[] | undefined;
      if (removeItems) {
        const inventory = await store.getInventory(saveId);
        for (const name of removeItems) {
          const item = inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
          if (item) {
            await store.removeItem(item.id);
            trace.add("state", `📦 -${item.name}`);
          }
        }
      }

      // Re-render character document
      const updatedChar = await store.getCharacter(saveId);
      const updatedInv = await store.getInventory(saveId);
      if (updatedChar) {
        const doc = renderCharacterSheet(updatedChar, updatedInv);
        await store.setDocument(saveId, "character", doc);
      }

      return { ok: true };
    },

    async update_world(args) {
      // Set flags
      const setFlags = args.set_flags as Record<string, string> | undefined;
      if (setFlags) {
        for (const [key, value] of Object.entries(setFlags)) {
          await store.setFlag(saveId, key, value);
          trace.add("flags", `🏴 ${key} = ${value}`);
        }
      }

      // Remove flags
      const removeFlags = args.remove_flags as string[] | undefined;
      if (removeFlags) {
        for (const key of removeFlags) {
          await store.deleteFlag(saveId, key);
          trace.add("flags", `🏴 -${key}`);
        }
      }

      // Add NPCs
      const addNpcs = args.add_npcs as Array<{ name: string; role?: string; loyalty?: number; notes?: string }> | undefined;
      if (addNpcs) {
        for (const npc of addNpcs) {
          await store.addNpc(saveId, npc);
          trace.add("npcs", `👥 +${npc.name}${npc.role ? ` (${npc.role})` : ""}`);
        }
      }

      // Update NPCs
      const updateNpcs = args.update_npcs as Array<{ name: string; loyalty?: number; alive?: boolean; notes?: string; role?: string }> | undefined;
      if (updateNpcs) {
        const currentNpcs = await store.getNpcs(saveId);
        for (const update of updateNpcs) {
          const npc = currentNpcs.find((n) => n.name.toLowerCase() === update.name.toLowerCase());
          if (npc) {
            const patch: Record<string, unknown> = {};
            if (update.loyalty !== undefined) patch.loyalty = update.loyalty;
            if (update.alive !== undefined) patch.alive = update.alive ? 1 : 0;
            if (update.notes !== undefined) patch.notes = update.notes;
            if (update.role !== undefined) patch.role = update.role;
            if (Object.keys(patch).length > 0) {
              await store.updateNpc(npc.id, patch);
              trace.add("npcs", `👥 ${npc.name} updated`);
            }
          }
        }
      }

      // Update current scene
      if (args.current_scene !== undefined) {
        await store.setDocument(saveId, "scene", args.current_scene as string);
      }

      // Re-render world document
      const updatedNpcs = await store.getNpcs(saveId);
      const updatedFlags = await store.getFlags(saveId);
      const updatedScenes = await store.getScenes(saveId);
      const sceneDoc = await store.getDocument(saveId, "scene");
      const worldDoc = renderWorldState(updatedNpcs, updatedFlags, updatedScenes, sceneDoc ?? undefined);
      await store.setDocument(saveId, "world", worldDoc);

      return { ok: true };
    },

    async end_scene(args) {
      const summary = args.summary as string;
      await store.addScene(saveId, summary);
      const sceneCompaction = await compactOnSceneEnd(store, saveId);
      if (sceneCompaction.trimmedCount > 0) {
        trace.add("meta", `📎 Scene compaction: trimmed ${sceneCompaction.trimmedCount} old messages`);
      }
      trace.add("meta", `📜 Scene ended: ${summary.slice(0, 60)}...`);
      return { ok: true };
    },

    async start_combat(args) {
      if (!character) return { error: "no character" };
      const rawEnemies = args.enemies as Array<{ name: string; count?: number }>;
      if (!rawEnemies?.length) return { error: "no enemies specified" };

      // Expand counts: [{name: "Goblin", count: 3}] → ["Goblin 1", "Goblin 2", "Goblin 3"]
      const enemyNames: string[] = [];
      for (const e of rawEnemies) {
        const count = e.count ?? 1;
        if (count === 1) {
          enemyNames.push(e.name);
        } else {
          for (let i = 1; i <= count; i++) {
            enemyNames.push(`${e.name} ${i}`);
          }
        }
      }

      const result = await startCombat(store, srd, saveId, character, enemyNames);

      trace.add("combat", `⚔️ Combat started!`);
      for (const c of result.initiativeOrder) {
        trace.add("combat", `  ${c.isPlayer ? "→" : " "} ${c.name}: ${c.initiative}`);
      }
      for (const e of result.enemies) {
        trace.add("combat", `  ${e.name}: ${e.hp_max} HP, AC ${e.ac}`);
      }

      return {
        initiative_order: result.initiativeOrder,
        enemies: result.enemies.map((e) => ({
          name: e.name,
          hp: e.hp_max,
          ac: e.ac,
          actions: e.actions.map((a) => a.name),
        })),
      };
    },

    async end_combat(args) {
      await store.endCombat(saveId);
      await store.deleteFlag(saveId, "_death_saves");
      trace.add("combat", `⚔️ Combat ended: ${args.reason}`);
      return { ok: true };
    },

    async enemy_action(args) {
      if (!character) return { error: "no character" };
      const combat = await store.getCombat(saveId);
      if (!combat) return { error: "not in combat" };

      const enemies = JSON.parse(combat.enemies_json) as Array<{
        name: string; hp_current: number; ac: number; attack_bonus: number;
        damage_dice: string; damage_bonus: number; dex: number;
        actions: Array<{ name: string; desc: string; attack_bonus?: number; damage_dice?: string; damage_bonus?: number }>;
        conditions: string[];
      }>;

      const enemyName = (args.enemy ?? args.name) as string | undefined;
      const actionName = args.action as string;
      if (!enemyName) return { error: "missing enemy name (use 'enemy' parameter)" };
      const enemy = enemies.find((e) => e.name.toLowerCase() === enemyName.toLowerCase());
      if (!enemy) return { error: `enemy "${enemyName}" not found` };
      if (enemy.hp_current <= 0) return { error: `${enemyName} is already down` };

      const result = resolveEnemyAttack(
        enemy as any,
        actionName,
        character.ac,
      );

      // Persist attack roll
      await store.addRoll(saveId, {
        checkType: "attack",
        notation: "1d20",
        modifier: result.attackRoll.total - result.attackRoll.nat,
        dc: character.ac,
        nat: result.attackRoll.nat,
        total: result.attackRoll.total,
        success: result.hit,
        crit: result.attackRoll.crit,
        fumble: result.attackRoll.fumble,
        reason: `${enemy.name}: ${result.action.name}`,
      });

      const critLabel = result.attackRoll.crit ? " ***CRIT***" : result.attackRoll.fumble ? " ***FUMBLE***" : "";
      trace.add("combat",
        `⚔️ ${enemy.name} → ${result.action.name}: nat ${result.attackRoll.nat} + ${result.attackRoll.total - result.attackRoll.nat} = ${result.attackRoll.total} vs AC ${character.ac} ${result.hit ? "✅" : "❌"}${critLabel}`
      );

      if (result.hit && result.damage) {
        const wasAtZero = character.hp_current <= 0;

        if (wasAtZero) {
          // Damage at 0 HP = automatic death save failure
          const deathSaveJson = await store.getFlag(saveId, "_death_saves");
          const deathState: DeathSaveState = deathSaveJson
            ? JSON.parse(deathSaveJson)
            : makeDeathSaveState();
          const updated = damageAtZeroHp(deathState, result.attackRoll.crit);
          await store.setFlag(saveId, "_death_saves", JSON.stringify(updated));
          const failCount = result.attackRoll.crit ? 2 : 1;
          trace.add("combat", `💀 Damage at 0 HP: +${failCount} death save failure${failCount > 1 ? "s" : ""} (${updated.failures}/3)`);

          return {
            hit: true,
            attack_total: result.attackRoll.total,
            nat: result.attackRoll.nat,
            crit: result.attackRoll.crit,
            damage: result.damage.total,
            target_hp: 0,
            target_hp_max: character.hp_max,
            unconscious: true,
            death_save_failures: updated.failures,
            dead: updated.dead,
          };
        }

        // Apply damage to player
        const newHp = Math.max(0, character.hp_current - result.damage.total);
        await store.updateCharacter(saveId, { hp_current: newHp });
        trace.add("state", `📊 HP: ${character.hp_current} → ${newHp}/${character.hp_max} (${result.damage.total} damage)`);
        character.hp_current = newHp;

        // If dropped to 0, initialize death saves
        if (newHp <= 0) {
          await store.setFlag(saveId, "_death_saves", JSON.stringify(makeDeathSaveState()));
          trace.add("combat", `💀 ${character.name} falls unconscious! Death saves begin.`);
        }

        // Re-render character doc
        const updatedChar = await store.getCharacter(saveId);
        const updatedInv = await store.getInventory(saveId);
        if (updatedChar) {
          await store.setDocument(saveId, "character", renderCharacterSheet(updatedChar, updatedInv));
        }

        return {
          hit: true,
          attack_total: result.attackRoll.total,
          nat: result.attackRoll.nat,
          crit: result.attackRoll.crit,
          damage: result.damage.total,
          target_hp: newHp,
          target_hp_max: character.hp_max,
          unconscious: newHp <= 0,
        };
      }

      // Advance turn
      await advanceTurn(store, saveId);

      return {
        hit: false,
        attack_total: result.attackRoll.total,
        nat: result.attackRoll.nat,
        fumble: result.attackRoll.fumble,
      };
    },
  };
}
