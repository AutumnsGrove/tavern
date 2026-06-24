-- 001_initial.sql — Full schema for Tavern game state

-- One row per campaign/save
CREATE TABLE IF NOT EXISTS saves (
    save_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    name TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saves_chat ON saves(chat_id);

-- Character mechanical data
CREATE TABLE IF NOT EXISTS characters (
    save_id TEXT PRIMARY KEY REFERENCES saves(save_id),
    name TEXT NOT NULL,
    race TEXT NOT NULL,
    class TEXT NOT NULL,
    subclass TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER DEFAULT 0,

    str INTEGER NOT NULL,
    dex INTEGER NOT NULL,
    con INTEGER NOT NULL,
    int INTEGER NOT NULL,
    wis INTEGER NOT NULL,
    cha INTEGER NOT NULL,

    hp_current INTEGER NOT NULL,
    hp_max INTEGER NOT NULL,
    ac INTEGER NOT NULL,
    speed INTEGER NOT NULL DEFAULT 30,
    proficiency_bonus INTEGER NOT NULL DEFAULT 2,

    ki_current INTEGER,
    ki_max INTEGER,
    spell_slots_json TEXT,
    hit_dice_remaining INTEGER,

    skill_proficiencies TEXT DEFAULT '[]',
    save_proficiencies TEXT DEFAULT '[]',
    tool_proficiencies TEXT DEFAULT '[]',

    updated_at TEXT DEFAULT (datetime('now'))
);

-- Inventory as individual rows
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    name TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    unit TEXT,
    equipped INTEGER DEFAULT 0,
    notes TEXT,
    category TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_save ON inventory(save_id);

-- Tracked NPCs
CREATE TABLE IF NOT EXISTS npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    name TEXT NOT NULL,
    role TEXT,
    loyalty INTEGER,
    alive INTEGER DEFAULT 1,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_npcs_save ON npcs(save_id);

-- World state flags
CREATE TABLE IF NOT EXISTS flags (
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    key TEXT NOT NULL,
    value TEXT DEFAULT 'true',
    set_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (save_id, key)
);

-- Living documents (character sheet + world state rendered views)
CREATE TABLE IF NOT EXISTS documents (
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    doc_type TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (save_id, doc_type)
);

-- Scene summaries (compacted narrative history)
CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    seq INTEGER NOT NULL,
    scene_id TEXT,
    summary TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scenes_save ON scenes(save_id);

-- Full message history
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_call_id TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_cents REAL,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_save_seq ON messages(save_id, seq);

-- Every dice roll (audit trail)
CREATE TABLE IF NOT EXISTS rolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT NOT NULL REFERENCES saves(save_id),
    msg_seq INTEGER,
    check_type TEXT,
    notation TEXT,
    modifier INTEGER,
    dc INTEGER,
    nat INTEGER,
    total INTEGER,
    success INTEGER,
    crit INTEGER DEFAULT 0,
    fumble INTEGER DEFAULT 0,
    reason TEXT,
    rolled_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rolls_save ON rolls(save_id);

-- Combat state (active combat only)
CREATE TABLE IF NOT EXISTS combat (
    save_id TEXT PRIMARY KEY REFERENCES saves(save_id),
    initiative_order TEXT,
    current_turn INTEGER DEFAULT 0,
    round INTEGER DEFAULT 1,
    enemies_json TEXT,
    state TEXT DEFAULT 'active'
);

-- Per-chat settings
CREATE TABLE IF NOT EXISTS settings (
    chat_id TEXT PRIMARY KEY,
    model TEXT,
    narration_mode TEXT DEFAULT 'verbose',
    traces_enabled INTEGER DEFAULT 1,
    voice_enabled INTEGER DEFAULT 0
);
