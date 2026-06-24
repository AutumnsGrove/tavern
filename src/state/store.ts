/**
 * Game state store. All D1 access goes through here.
 * Consumers call typed methods, never raw SQL.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface Save {
  save_id: string;
  chat_id: string;
  name: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Character {
  save_id: string;
  name: string;
  race: string;
  class: string;
  subclass: string | null;
  level: number;
  xp: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  hp_current: number;
  hp_max: number;
  ac: number;
  speed: number;
  proficiency_bonus: number;
  ki_current: number | null;
  ki_max: number | null;
  spell_slots_json: string | null;
  hit_dice_remaining: number | null;
  class_resources_json: string;
  skill_proficiencies: string; // JSON array
  save_proficiencies: string;  // JSON array
  tool_proficiencies: string;  // JSON array
  updated_at: string;
}

export interface InventoryItem {
  id: number;
  save_id: string;
  name: string;
  qty: number;
  unit: string | null;
  equipped: number;
  notes: string | null;
  category: string | null;
}

export interface Npc {
  id: number;
  save_id: string;
  name: string;
  role: string | null;
  loyalty: number | null;
  alive: number;
  notes: string | null;
}

export interface Flag {
  save_id: string;
  key: string;
  value: string;
  set_at: string;
}

export interface Document {
  save_id: string;
  doc_type: string;
  content: string;
  updated_at: string;
}

export interface Scene {
  id: number;
  save_id: string;
  seq: number;
  scene_id: string | null;
  summary: string;
  created_at: string;
}

export interface Message {
  id: number;
  save_id: string;
  seq: number;
  role: string;
  content: string;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  model: string | null;
  created_at: string;
}

export interface Roll {
  id: number;
  save_id: string;
  msg_seq: number | null;
  check_type: string | null;
  notation: string | null;
  modifier: number | null;
  dc: number | null;
  nat: number | null;
  total: number | null;
  success: number | null;
  crit: number;
  fumble: number;
  reason: string | null;
  rolled_at: string;
}

export interface CombatState {
  save_id: string;
  initiative_order: string; // JSON
  current_turn: number;
  round: number;
  enemies_json: string;     // JSON
  state: string;
}

export interface Settings {
  chat_id: string;
  model: string | null;
  narration_mode: string;
  traces_enabled: number;
  voice_enabled: number;
}

// ── Store ──────────────────────────────────────────────────────────

export class GameStore {
  constructor(private db: D1Database) {}

  // ── Saves ──

  async createSave(saveId: string, chatId: string, name?: string): Promise<Save> {
    await this.db
      .prepare("INSERT INTO saves (save_id, chat_id, name) VALUES (?, ?, ?)")
      .bind(saveId, chatId, name ?? null)
      .run();
    return (await this.getSave(saveId))!;
  }

  async getSave(saveId: string): Promise<Save | null> {
    return this.db
      .prepare("SELECT * FROM saves WHERE save_id = ?")
      .bind(saveId)
      .first<Save>();
  }

  async getActiveSave(chatId: string): Promise<Save | null> {
    return this.db
      .prepare("SELECT * FROM saves WHERE chat_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1")
      .bind(chatId)
      .first<Save>();
  }

  async listSaves(chatId: string): Promise<Save[]> {
    const result = await this.db
      .prepare("SELECT * FROM saves WHERE chat_id = ? ORDER BY updated_at DESC")
      .bind(chatId)
      .all<Save>();
    return result.results;
  }

  async updateSaveTimestamp(saveId: string): Promise<void> {
    await this.db
      .prepare("UPDATE saves SET updated_at = datetime('now') WHERE save_id = ?")
      .bind(saveId)
      .run();
  }

  // ── Characters ──

  async createCharacter(char: Omit<Character, "updated_at">): Promise<void> {
    await this.db
      .prepare(`INSERT INTO characters (
        save_id, name, race, class, subclass, level, xp,
        str, dex, con, int, wis, cha,
        hp_current, hp_max, ac, speed, proficiency_bonus,
        ki_current, ki_max, spell_slots_json, hit_dice_remaining,
        class_resources_json,
        skill_proficiencies, save_proficiencies, tool_proficiencies
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        char.save_id, char.name, char.race, char.class, char.subclass,
        char.level, char.xp,
        char.str, char.dex, char.con, char.int, char.wis, char.cha,
        char.hp_current, char.hp_max, char.ac, char.speed, char.proficiency_bonus,
        char.ki_current, char.ki_max, char.spell_slots_json, char.hit_dice_remaining,
        char.class_resources_json,
        char.skill_proficiencies, char.save_proficiencies, char.tool_proficiencies,
      )
      .run();
  }

  async getCharacter(saveId: string): Promise<Character | null> {
    return this.db
      .prepare("SELECT * FROM characters WHERE save_id = ?")
      .bind(saveId)
      .first<Character>();
  }

  async updateCharacter(saveId: string, patch: Partial<Omit<Character, "save_id" | "updated_at">>): Promise<void> {
    const fields = Object.keys(patch);
    if (fields.length === 0) return;

    const sets = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => (patch as Record<string, unknown>)[f]);

    await this.db
      .prepare(`UPDATE characters SET ${sets}, updated_at = datetime('now') WHERE save_id = ?`)
      .bind(...values, saveId)
      .run();
  }

  // ── Inventory ──

  async addItem(saveId: string, item: { name: string; qty?: number; unit?: string; equipped?: boolean; notes?: string; category?: string }): Promise<number> {
    const result = await this.db
      .prepare("INSERT INTO inventory (save_id, name, qty, unit, equipped, notes, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(saveId, item.name, item.qty ?? 1, item.unit ?? null, item.equipped ? 1 : 0, item.notes ?? null, item.category ?? null)
      .run();
    return result.meta.last_row_id;
  }

  async getInventory(saveId: string): Promise<InventoryItem[]> {
    const result = await this.db
      .prepare("SELECT * FROM inventory WHERE save_id = ? ORDER BY category, name")
      .bind(saveId)
      .all<InventoryItem>();
    return result.results;
  }

  async removeItem(itemId: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM inventory WHERE id = ?")
      .bind(itemId)
      .run();
  }

  async updateItemQty(itemId: number, qty: number): Promise<void> {
    await this.db
      .prepare("UPDATE inventory SET qty = ? WHERE id = ?")
      .bind(qty, itemId)
      .run();
  }

  // ── NPCs ──

  async addNpc(saveId: string, npc: { name: string; role?: string; loyalty?: number; notes?: string }): Promise<number> {
    const result = await this.db
      .prepare("INSERT INTO npcs (save_id, name, role, loyalty, notes) VALUES (?, ?, ?, ?, ?)")
      .bind(saveId, npc.name, npc.role ?? null, npc.loyalty ?? null, npc.notes ?? null)
      .run();
    return result.meta.last_row_id;
  }

  async getNpcs(saveId: string): Promise<Npc[]> {
    const result = await this.db
      .prepare("SELECT * FROM npcs WHERE save_id = ? ORDER BY name")
      .bind(saveId)
      .all<Npc>();
    return result.results;
  }

  async updateNpc(npcId: number, patch: Partial<Omit<Npc, "id" | "save_id">>): Promise<void> {
    const fields = Object.keys(patch);
    if (fields.length === 0) return;
    const sets = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
    await this.db
      .prepare(`UPDATE npcs SET ${sets} WHERE id = ?`)
      .bind(...values, npcId)
      .run();
  }

  // ── Flags ──

  async setFlag(saveId: string, key: string, value: string = "true"): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO flags (save_id, key, value, set_at) VALUES (?, ?, ?, datetime('now'))")
      .bind(saveId, key, value)
      .run();
  }

  async getFlag(saveId: string, key: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT value FROM flags WHERE save_id = ? AND key = ?")
      .bind(saveId, key)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  async getFlags(saveId: string): Promise<Flag[]> {
    const result = await this.db
      .prepare("SELECT * FROM flags WHERE save_id = ? ORDER BY key")
      .bind(saveId)
      .all<Flag>();
    return result.results;
  }

  async deleteFlag(saveId: string, key: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM flags WHERE save_id = ? AND key = ?")
      .bind(saveId, key)
      .run();
  }

  // ── Documents ──

  async setDocument(saveId: string, docType: string, content: string): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO documents (save_id, doc_type, content, updated_at) VALUES (?, ?, ?, datetime('now'))")
      .bind(saveId, docType, content)
      .run();
  }

  async getDocument(saveId: string, docType: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT content FROM documents WHERE save_id = ? AND doc_type = ?")
      .bind(saveId, docType)
      .first<{ content: string }>();
    return row?.content ?? null;
  }

  // ── Scenes ──

  async addScene(saveId: string, summary: string, sceneId?: string): Promise<void> {
    const maxSeq = await this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) as max_seq FROM scenes WHERE save_id = ?")
      .bind(saveId)
      .first<{ max_seq: number }>();
    const seq = (maxSeq?.max_seq ?? 0) + 1;

    await this.db
      .prepare("INSERT INTO scenes (save_id, seq, scene_id, summary) VALUES (?, ?, ?, ?)")
      .bind(saveId, seq, sceneId ?? null, summary)
      .run();
  }

  async getScenes(saveId: string): Promise<Scene[]> {
    const result = await this.db
      .prepare("SELECT * FROM scenes WHERE save_id = ? ORDER BY seq")
      .bind(saveId)
      .all<Scene>();
    return result.results;
  }

  // ── Messages ──

  async addMessage(saveId: string, msg: {
    role: string;
    content: string;
    toolCallsJson?: string;
    toolCallId?: string;
    tokensIn?: number;
    tokensOut?: number;
    costCents?: number;
    model?: string;
  }): Promise<number> {
    const maxSeq = await this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) as max_seq FROM messages WHERE save_id = ?")
      .bind(saveId)
      .first<{ max_seq: number }>();
    const seq = (maxSeq?.max_seq ?? 0) + 1;

    const result = await this.db
      .prepare(`INSERT INTO messages (
        save_id, seq, role, content, tool_calls_json, tool_call_id,
        tokens_in, tokens_out, cost_cents, model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        saveId, seq, msg.role, msg.content,
        msg.toolCallsJson ?? null, msg.toolCallId ?? null,
        msg.tokensIn ?? null, msg.tokensOut ?? null,
        msg.costCents ?? null, msg.model ?? null,
      )
      .run();
    return result.meta.last_row_id;
  }

  async getRecentMessages(saveId: string, limit: number = 30): Promise<Message[]> {
    const result = await this.db
      .prepare("SELECT * FROM messages WHERE save_id = ? ORDER BY seq DESC LIMIT ?")
      .bind(saveId, limit)
      .all<Message>();
    return result.results.reverse();
  }

  async getMessageCount(saveId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) as count FROM messages WHERE save_id = ?")
      .bind(saveId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async deleteMessagesAfterSeq(saveId: string, seq: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM messages WHERE save_id = ? AND seq > ?")
      .bind(saveId, seq)
      .run();
  }

  async deleteMessagesBeforeSeq(saveId: string, seq: number): Promise<void> {
    await this.db
      .prepare("DELETE FROM messages WHERE save_id = ? AND seq < ?")
      .bind(saveId, seq)
      .run();
  }

  // ── Rolls ──

  async addRoll(saveId: string, roll: {
    msgSeq?: number;
    checkType?: string;
    notation?: string;
    modifier?: number;
    dc?: number;
    nat?: number;
    total?: number;
    success?: boolean;
    crit?: boolean;
    fumble?: boolean;
    reason?: string;
  }): Promise<void> {
    await this.db
      .prepare(`INSERT INTO rolls (
        save_id, msg_seq, check_type, notation, modifier, dc,
        nat, total, success, crit, fumble, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        saveId, roll.msgSeq ?? null, roll.checkType ?? null,
        roll.notation ?? null, roll.modifier ?? null, roll.dc ?? null,
        roll.nat ?? null, roll.total ?? null,
        roll.success !== undefined ? (roll.success ? 1 : 0) : null,
        roll.crit ? 1 : 0, roll.fumble ? 1 : 0,
        roll.reason ?? null,
      )
      .run();
  }

  async getRolls(saveId: string, limit: number = 50): Promise<Roll[]> {
    const result = await this.db
      .prepare("SELECT * FROM rolls WHERE save_id = ? ORDER BY id DESC LIMIT ?")
      .bind(saveId, limit)
      .all<Roll>();
    return result.results.reverse();
  }

  // ── Combat ──

  async setCombat(saveId: string, combat: {
    initiativeOrder: string;
    enemiesJson: string;
  }): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO combat (save_id, initiative_order, enemies_json) VALUES (?, ?, ?)")
      .bind(saveId, combat.initiativeOrder, combat.enemiesJson)
      .run();
  }

  async getCombat(saveId: string): Promise<CombatState | null> {
    return this.db
      .prepare("SELECT * FROM combat WHERE save_id = ? AND state = 'active'")
      .bind(saveId)
      .first<CombatState>();
  }

  async updateCombat(saveId: string, patch: Partial<Omit<CombatState, "save_id">>): Promise<void> {
    const fields = Object.keys(patch);
    if (fields.length === 0) return;
    const sets = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
    await this.db
      .prepare(`UPDATE combat SET ${sets} WHERE save_id = ?`)
      .bind(...values, saveId)
      .run();
  }

  async endCombat(saveId: string): Promise<void> {
    await this.db
      .prepare("UPDATE combat SET state = 'ended' WHERE save_id = ?")
      .bind(saveId)
      .run();
  }

  // ── Settings ──

  async getSettings(chatId: string): Promise<Settings> {
    const existing = await this.db
      .prepare("SELECT * FROM settings WHERE chat_id = ?")
      .bind(chatId)
      .first<Settings>();

    if (existing) return existing;

    // Create defaults
    await this.db
      .prepare("INSERT INTO settings (chat_id) VALUES (?)")
      .bind(chatId)
      .run();
    return (await this.db
      .prepare("SELECT * FROM settings WHERE chat_id = ?")
      .bind(chatId)
      .first<Settings>())!;
  }

  async updateSettings(chatId: string, patch: Partial<Omit<Settings, "chat_id">>): Promise<void> {
    const fields = Object.keys(patch);
    if (fields.length === 0) return;
    const sets = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => (patch as Record<string, unknown>)[f]);
    await this.db
      .prepare(`UPDATE settings SET ${sets} WHERE chat_id = ?`)
      .bind(...values, chatId)
      .run();
  }

  // ── Migrations ──

  async migrate(): Promise<void> {
    // Create tracking table
    await this.db
      .prepare(`CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )`)
      .run();

    // For now, just run the initial migration if not applied
    const applied = await this.db
      .prepare("SELECT id FROM _migrations WHERE name = '001_initial'")
      .first();

    if (!applied) {
      // Read and execute the migration SQL
      // In production this would read from the bundled migration files
      // For now we inline the check — the actual SQL is in migrations/001_initial.sql
      // and gets applied via `wrangler d1 migrations apply` or the seed script
      await this.db
        .prepare("INSERT INTO _migrations (name) VALUES ('001_initial')")
        .run();
    }
  }
}
