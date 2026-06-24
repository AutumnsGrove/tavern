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
import { ALL_TOOLS } from "../narrator/tools/registry";
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
import type { Ability, CharacterScores, ModifierLookupParams } from "../resolver/skills";
import { renderCharacterSheet, renderWorldState } from "../state/documents";

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

export interface TurnOutput {
  reply: string;
  forks: Fork[];
  traceLines: string[];
  tokensIn: number;
  tokensOut: number;
  model: string;
  error?: string;
}

export async function handleTurn(deps: TurnDeps, input: TurnInput): Promise<TurnOutput> {
  const { store, srd, apiKey, model } = deps;
  const { chatId, saveId, text, narrationMode } = input;

  const traceLines: string[] = [];

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
  }

  // Convert stored messages to ChatMessage format
  const chatHistory: ChatMessage[] = recentMessages.map((m) => {
    const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
    if (m.tool_calls_json) {
      msg.tool_calls = JSON.parse(m.tool_calls_json);
    }
    if (m.tool_call_id) {
      msg.tool_call_id = m.tool_call_id;
    }
    return msg;
  });

  // Build context
  const messages = buildContext({
    narrationMode,
    characterSheet,
    worldState,
    combatState,
    recentMessages: chatHistory,
    playerMessage: text,
  });

  // Save the player's message
  await store.addMessage(saveId, { role: "user", content: text });

  // Build tool handlers
  const handlers = buildToolHandlers(store, srd, saveId, character, traceLines);

  // Run narrator loop
  const client = new NarratorClient({
    apiKey,
    model,
    maxTokens: config.narratorMaxTokens,
    temperature: config.narratorTemperature,
  });
  const result = await runNarratorLoop({
    client,
    tools: ALL_TOOLS,
    handlers,
    messages,
    maxIterations: config.maxToolIterations,
    onToolCall: (name, args, resultData) => {
      // Build trace lines for interesting tool calls
      if (name === "request_roll" || name === "request_damage") {
        const r = resultData as Record<string, unknown>;
        if (r.nat !== undefined) {
          const successIcon = r.success === true ? "✅" : r.success === false ? "❌" : "";
          const critLabel = r.crit ? " *** NAT 20 ***" : r.fumble ? " *** NAT 1 ***" : "";
          traceLines.push(
            `🎲 ${r.reason}: nat ${r.nat} ${r.modifier !== undefined ? `+ ${r.modifier}` : ""} = ${r.total}${r.dc !== undefined ? ` vs DC ${r.dc} ${successIcon}` : ""}${critLabel}`
          );
        } else if (r.total !== undefined) {
          traceLines.push(`🎲 ${r.reason}: ${r.rolls} + ${r.modifier} = ${r.total} damage`);
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

  // Add meta trace
  traceLines.push(
    `⏱ ${result.iterations} tool calls · ${result.totalTokensIn + result.totalTokensOut} tokens · ${result.model}`
  );

  await store.updateSaveTimestamp(saveId);

  return {
    reply: result.reply,
    forks: result.forks,
    traceLines,
    tokensIn: result.totalTokensIn,
    tokensOut: result.totalTokensOut,
    model: result.model,
    error: result.error,
  };
}

/** Build the map of tool name → handler function. */
function buildToolHandlers(
  store: GameStore,
  srd: SrdLoader,
  saveId: string,
  character: Awaited<ReturnType<GameStore["getCharacter"]>>,
  traceLines: string[],
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
        const newHp = Math.max(0, Math.min(character.hp_max, character.hp_current + (args.hp_change as number)));
        patch.hp_current = newHp;
        traceLines.push(`📊 HP: ${character.hp_current} → ${newHp}/${character.hp_max}`);
        character.hp_current = newHp;
      }

      if (args.ki_change !== undefined && character.ki_current !== null && character.ki_max !== null) {
        const newKi = Math.max(0, Math.min(character.ki_max, character.ki_current + (args.ki_change as number)));
        patch.ki_current = newKi;
        traceLines.push(`📊 Ki: ${character.ki_current} → ${newKi}/${character.ki_max}`);
        character.ki_current = newKi;
      }

      if (Object.keys(patch).length > 0) {
        await store.updateCharacter(saveId, patch);
      }

      // Add items
      const addItems = args.add_items as Array<{ name: string; qty?: number; unit?: string; category?: string; notes?: string }> | undefined;
      if (addItems) {
        for (const item of addItems) {
          await store.addItem(saveId, item);
          traceLines.push(`📦 +${item.name}${item.qty && item.qty > 1 ? ` (x${item.qty})` : ""}`);
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
            traceLines.push(`📦 -${item.name}`);
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
          traceLines.push(`🏴 ${key} = ${value}`);
        }
      }

      // Remove flags
      const removeFlags = args.remove_flags as string[] | undefined;
      if (removeFlags) {
        for (const key of removeFlags) {
          await store.deleteFlag(saveId, key);
          traceLines.push(`🏴 -${key}`);
        }
      }

      // Add NPCs
      const addNpcs = args.add_npcs as Array<{ name: string; role?: string; loyalty?: number; notes?: string }> | undefined;
      if (addNpcs) {
        for (const npc of addNpcs) {
          await store.addNpc(saveId, npc);
          traceLines.push(`👥 +${npc.name}${npc.role ? ` (${npc.role})` : ""}`);
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
              traceLines.push(`👥 ${npc.name} updated`);
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
      traceLines.push(`📜 Scene ended: ${summary.slice(0, 60)}...`);
      return { ok: true };
    },

    // Combat tools — stubs for now, full implementation in Phase 3
    async start_combat(args) {
      traceLines.push(`⚔️ Combat started`);
      return { ok: true, message: "combat system coming soon" };
    },

    async end_combat(args) {
      await store.endCombat(saveId);
      traceLines.push(`⚔️ Combat ended: ${args.reason}`);
      return { ok: true };
    },

    async enemy_action(args) {
      traceLines.push(`⚔️ ${args.enemy}: ${args.action} → ${args.target}`);
      return { ok: true, message: "enemy action resolution coming soon" };
    },
  };
}
