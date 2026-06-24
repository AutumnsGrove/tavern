/**
 * Combat engine. Manages the combat state machine:
 *
 *   EXPLORATION → start_combat → INITIATIVE
 *   INITIATIVE → rollInitiative → ACTIVE (turn cycling)
 *   ACTIVE → player/enemy turns → request_roll, enemy_action
 *   ACTIVE → end_combat → EXPLORATION
 *
 * Enemies are loaded from the SRD bestiary. Their combat state
 * (HP, conditions) is stored in the combat table as JSON.
 * The character's HP is tracked in the character table as always.
 */

import type { SrdLoader } from "../srd/loader";
import type { GameStore } from "../state/store";
import type { Character } from "../state/store";
import { rollInitiative as rollInit, resolve, resolveDamage } from "../resolver/dice";
import { abilityModifier } from "../resolver/skills";

export interface CombatEnemy {
  name: string;
  index: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  attack_bonus: number;
  damage_dice: string;
  damage_bonus: number;
  dex: number;
  actions: EnemyAction[];
  conditions: string[];
}

export interface EnemyAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_bonus?: number;
}

export interface Combatant {
  name: string;
  initiative: number;
  isPlayer: boolean;
}

/**
 * Start combat: look up enemies from SRD, roll initiative, store state.
 */
export async function startCombat(
  store: GameStore,
  srd: SrdLoader,
  saveId: string,
  character: Character,
  enemyNames: string[],
): Promise<{
  enemies: CombatEnemy[];
  initiativeOrder: Combatant[];
  playerInitiative: number;
}> {
  const enemies: CombatEnemy[] = [];

  for (const name of enemyNames) {
    // Strip trailing number for SRD lookup ("Goblin 2" → "goblin")
    const baseName = name.replace(/\s+\d+$/, "");
    const index = baseName.toLowerCase().replace(/\s+/g, "-");
    const monster = await srd.lookup<SrdMonster>("monster", index);

    if (monster) {
      const actions = parseMonsterActions(monster);
      const primaryAction = actions[0];

      enemies.push({
        name,
        index: monster.index,
        hp_current: monster.hit_points,
        hp_max: monster.hit_points,
        ac: Array.isArray(monster.armor_class)
          ? monster.armor_class[0]?.value ?? 10
          : 10,
        attack_bonus: primaryAction?.attack_bonus ?? abilityModifier(monster.dexterity) + 2,
        damage_dice: primaryAction?.damage_dice ?? "1d4",
        damage_bonus: primaryAction?.damage_bonus ?? abilityModifier(monster.strength),
        dex: monster.dexterity,
        actions,
        conditions: [],
      });
    } else {
      // Unknown enemy — create a generic one
      enemies.push({
        name,
        index: name.toLowerCase().replace(/\s+/g, "-"),
        hp_current: 15,
        hp_max: 15,
        ac: 12,
        attack_bonus: 3,
        damage_dice: "1d6",
        damage_bonus: 1,
        dex: 10,
        actions: [{ name: "Attack", desc: `${name} attacks.` }],
        conditions: [],
      });
    }
  }

  // Roll initiative for everyone
  const playerDexMod = abilityModifier(character.dex);
  const combatants = rollInit([
    { name: character.name, modifier: playerDexMod },
    ...enemies.map((e) => ({ name: e.name, modifier: abilityModifier(e.dex) })),
  ]);

  // Store combat state
  await store.setCombat(saveId, {
    initiativeOrder: JSON.stringify(combatants),
    enemiesJson: JSON.stringify(enemies),
  });

  return {
    enemies,
    initiativeOrder: combatants.map((c) => ({
      name: c.name,
      initiative: c.total,
      isPlayer: c.name === character.name,
    })),
    playerInitiative: combatants.find((c) => c.name === character.name)?.total ?? 0,
  };
}

/**
 * Resolve an enemy's action against a target.
 */
export function resolveEnemyAttack(
  enemy: CombatEnemy,
  actionName: string,
  targetAC: number,
): {
  action: EnemyAction;
  attackRoll: { nat: number; total: number; crit: boolean; fumble: boolean };
  hit: boolean;
  damage?: { total: number; rolls: number[] };
} {
  const action = enemy.actions.find(
    (a) => a.name.toLowerCase() === actionName.toLowerCase(),
  ) ?? enemy.actions[0]!;

  const attackBonus = action.attack_bonus ?? enemy.attack_bonus;
  const attackResult = resolve({
    type: "attack",
    modifier: attackBonus,
    dc: targetAC,
    reason: `${enemy.name}: ${action.name}`,
  });

  const hit = attackResult.crit || (attackResult.total >= targetAC && !attackResult.fumble);

  let damage: { total: number; rolls: number[] } | undefined;
  if (hit) {
    const dice = action.damage_dice ?? enemy.damage_dice;
    const bonus = action.damage_bonus ?? enemy.damage_bonus;
    const damageResult = resolveDamage({
      dice,
      modifier: bonus,
      reason: `${enemy.name}: ${action.name} damage`,
    });
    // Double dice on crit
    if (attackResult.crit) {
      const critExtra = resolveDamage({ dice, modifier: 0, reason: "crit bonus" });
      damage = {
        total: damageResult.total + critExtra.total,
        rolls: [...damageResult.rolls, ...critExtra.rolls],
      };
    } else {
      damage = { total: damageResult.total, rolls: damageResult.rolls };
    }
  }

  return {
    action,
    attackRoll: {
      nat: attackResult.nat,
      total: attackResult.total,
      crit: attackResult.crit,
      fumble: attackResult.fumble,
    },
    hit,
    damage,
  };
}

/**
 * Advance to the next turn in initiative order.
 */
export async function advanceTurn(
  store: GameStore,
  saveId: string,
): Promise<{ name: string; isNewRound: boolean } | null> {
  const combat = await store.getCombat(saveId);
  if (!combat) return null;

  const order = JSON.parse(combat.initiative_order) as Array<{ name: string }>;
  let nextTurn = combat.current_turn + 1;
  let isNewRound = false;

  if (nextTurn >= order.length) {
    nextTurn = 0;
    isNewRound = true;
    await store.updateCombat(saveId, {
      current_turn: nextTurn,
      round: combat.round + 1,
    });
  } else {
    await store.updateCombat(saveId, { current_turn: nextTurn });
  }

  return { name: order[nextTurn]!.name, isNewRound };
}

/**
 * Apply damage to an enemy. Returns true if the enemy is downed.
 */
export async function damageEnemy(
  store: GameStore,
  saveId: string,
  enemyName: string,
  damage: number,
): Promise<{ downed: boolean; hpRemaining: number }> {
  const combat = await store.getCombat(saveId);
  if (!combat) return { downed: false, hpRemaining: 0 };

  const enemies = JSON.parse(combat.enemies_json) as CombatEnemy[];
  const enemy = enemies.find((e) => e.name.toLowerCase() === enemyName.toLowerCase());
  if (!enemy) return { downed: false, hpRemaining: 0 };

  enemy.hp_current = Math.max(0, enemy.hp_current - damage);
  await store.updateCombat(saveId, { enemies_json: JSON.stringify(enemies) });

  return { downed: enemy.hp_current <= 0, hpRemaining: enemy.hp_current };
}

/**
 * Check if all enemies are down (combat should end).
 */
export async function allEnemiesDown(store: GameStore, saveId: string): Promise<boolean> {
  const combat = await store.getCombat(saveId);
  if (!combat) return true;

  const enemies = JSON.parse(combat.enemies_json) as CombatEnemy[];
  return enemies.every((e) => e.hp_current <= 0);
}

// ── SRD monster type helpers ──

interface SrdMonster {
  index: string;
  name: string;
  hit_points: number;
  hit_dice: string;
  armor_class: Array<{ value: number }>;
  strength: number;
  dexterity: number;
  constitution: number;
  actions?: Array<{
    name: string;
    desc: string;
    attack_bonus?: number;
    damage?: Array<{
      damage_dice?: string;
      damage_bonus?: number;
    }>;
  }>;
  challenge_rating: number;
}

function parseMonsterActions(monster: SrdMonster): EnemyAction[] {
  if (!monster.actions) return [];

  return monster.actions.map((a) => {
    const primary = a.damage?.[0];
    // Parse attack bonus from desc if not provided directly
    let attackBonus = a.attack_bonus;
    if (attackBonus === undefined) {
      const match = a.desc.match(/([+-]\d+) to hit/);
      if (match) attackBonus = parseInt(match[1]!, 10);
    }

    // Parse damage dice from desc if not in structured data
    let damageDice = primary?.damage_dice;
    let damageBonus = primary?.damage_bonus ?? 0;
    if (!damageDice) {
      const dMatch = a.desc.match(/(\d+d\d+)\s*([+-]\s*\d+)?/);
      if (dMatch) {
        damageDice = dMatch[1];
        if (dMatch[2]) damageBonus = parseInt(dMatch[2].replace(/\s/g, ""), 10);
      }
    }

    return {
      name: a.name,
      desc: a.desc,
      attack_bonus: attackBonus,
      damage_dice: damageDice,
      damage_bonus: damageBonus,
    };
  });
}
