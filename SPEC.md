# Tavern — SPEC.md

A choose-your-own-adventure game engine loosely based on D&D 5e, playable via Telegram.
Always-on, Cloudflare-native, model-agnostic.

Born from a 64-message Claude session playing Sayola, a tiefling monk who stole a slave
ship and sailed it to Havana. The session proved the core loop works. This document turns
it into a system.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [The Game Loop](#2-the-game-loop)
3. [Architecture Overview](#3-architecture-overview)
4. [Gateway & Adapters](#4-gateway--adapters)
5. [The Narrator (LLM Agent)](#5-the-narrator-llm-agent)
6. [Tool Surface](#6-tool-surface)
7. [The Resolver (Dice Engine)](#7-the-resolver-dice-engine)
8. [Combat System](#8-combat-system)
9. [State & Storage](#9-state--storage)
10. [The Two Documents](#10-the-two-documents)
11. [Compaction & Long Campaigns](#11-compaction--long-campaigns)
12. [SRD Reference Data](#12-srd-reference-data)
13. [Character Creation (Onboarding)](#13-character-creation-onboarding)
14. [Commands](#14-commands)
15. [Traces](#15-traces)
16. [Voice Memos](#16-voice-memos)
17. [Narration Modes](#17-narration-modes)
18. [Sim Mode](#18-sim-mode)
19. [Cloudflare Deployment](#19-cloudflare-deployment)
20. [Local Development](#20-local-development)
21. [Project Structure](#21-project-structure)
22. [Build Order](#22-build-order)

---

## 1. Core Principles

### The LLM never rolls dice.
The model emits structured roll requests. The engine rolls via `crypto.getRandomValues()`.
The model never produces, copies, or calculates a number that affects game mechanics.
This is the single rule that makes it a game instead of fan-fiction.

### The LLM never does math.
Modifiers come from the character sheet. The engine looks them up. The model says
"stealth check, DC 15" — it never says "stealth check, modifier +9, DC 15." If
the model passes a modifier, the engine ignores it and uses the sheet value.

### Static over generated.
If the answer can be computed from structured data, the LLM never sees the request.
`/sheet`, `/inventory`, `/abilities` — all rendered from the database, zero tokens.
The LLM is for narration and narrative judgment. Everything else is code.

### The SRD is the rules lawyer.
D&D mechanics come from the embedded 5e SRD data, not model training data. The model
is the narrator and DM — it decides WHEN to call for a check and sets DCs based on
narrative context. It does NOT decide what Stunning Strike does or how many hit points
a Level 5 Fighter has. The SRD answers those questions.

### Gateway architecture.
The game engine doesn't know about Telegram. A gateway sits between adapters
(Telegram, local dev UI, sim runner) and the engine. Same pattern as her-go.
Future adapters (Discord, multiplayer) plug in without touching the engine.

### SQLite everywhere.
Local dev uses SQLite on disk. Production uses Cloudflare D1 (which is SQLite).
One schema, no drift, no adapter layer.

---

## 2. The Game Loop

```
Player sends message (text, voice memo, or button tap)
        │
        ▼
┌──────────────────┐
│  GATEWAY         │ Adapter converts to standard InboundMsg
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  ENGINE          │ Loads state, builds context, calls narrator
└──────────────────┘
        │
        ▼
┌──────────────────┐   Tool calls:
│  NARRATOR (LLM)  │──▶ think → request_roll → update_character
│                  │──▶ update_world → reply → present_forks → done
└──────────────────┘
        │                        │
        │ (roll requests)        │
        ▼                        │
┌──────────────────┐             │
│  RESOLVER        │ dice via    │
│  (crypto RNG)    │ secrets     │
└──────────────────┘             │
        │                        │
        │ (results)              │
        ▼                        │
┌──────────────────┐             │
│  ENGINE          │◀────────────┘
│  (state update)  │ Persists all changes, renders trace
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  GATEWAY         │ Sends narrative + fork buttons + trace message
└──────────────────┘
```

The narrator runs in a tool-calling loop. Each iteration it can call one or more
tools. The loop continues until the model calls `done`. If the model calls `done`
without having called `reply`, the engine retries the turn.

---

## 3. Architecture Overview

```
tavern/
├── gateway/           # Adapter interface, message types, command registry
├── engine/            # Turn orchestration, context building, state management
├── narrator/          # LLM client, prompt assembly, tool dispatch
├── resolver/          # Dice rolling, RNG, roll result formatting
├── combat/            # Combat state machine, initiative, turn tracking
├── state/             # SQLite/D1 storage layer, migrations
├── srd/               # Embedded D&D 5e SRD data (JSON)
├── trace/             # Behind-the-scenes observability board
├── adapters/
│   ├── telegram/      # Telegram Bot API, webhooks, inline keyboards
│   ├── local/         # Local dev UI (Telegram-clone web interface)
│   └── sim/           # Automated test runner
├── worker/            # Cloudflare Worker entry point
├── commands/          # Static command handlers (no LLM)
├── onboarding/        # Character creation flow
└── voice/             # STT integration (OpenRouter Parakeet/Whisper)
```

### Language: TypeScript

Cloudflare Workers are JS/TS native. The entire project is TypeScript, targeting
the Workers runtime for production and Node.js for local development. The resolver
prototype (`roll.py`) is reference only — the production resolver is TS using
`crypto.getRandomValues()`.

---

## 4. Gateway & Adapters

Lifted from her-go. The gateway is the routing layer between adapters and the engine.

### InboundMsg

```typescript
interface InboundMsg {
  text: string;
  audio?: ArrayBuffer;        // voice memo (OGG/Opus from Telegram)
  chatId: string;             // adapter-assigned, one chat = one save
  adapterName: string;        // "telegram", "local", "sim"
  timestamp: Date;
  callbackData?: string;      // inline keyboard button payload
}
```

### OutboundMsg

```typescript
interface OutboundMsg {
  text: string;               // narrative prose (Markdown)
  forks?: Fork[];             // 3-5 choices for inline keyboard
  traceText?: string;         // behind-the-scenes message content
  audio?: ArrayBuffer;        // TTS audio if enabled
  isError?: boolean;
}

interface Fork {
  label: string;              // button text (short — fits a button)
  detail: string;             // full description (sent as player input when tapped)
}
```

### Adapter Interface

```typescript
interface Adapter {
  name: string;
  capabilities: CapSet;
  start(ctx: AbortSignal): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: InboundMsg) => Promise<OutboundMsg>): void;
  sendForks(chatId: string, forks: Fork[]): Promise<void>;
  sendTrace(chatId: string, text: string): Promise<void>;
  sendTyping(chatId: string): void;
}

interface CapSet {
  inlineKeyboard: boolean;    // fork buttons
  messageEdit: boolean;       // edit-in-place (for streaming / trace updates)
  streaming: boolean;         // token-by-token delivery
  voice: boolean;             // voice memo support
  typing: boolean;            // typing indicators
}
```

### Adapters

**Telegram** — production adapter. Webhook-based. Inline keyboards for forks.
Voice memos via Telegram file API. Trace rendered as a separate message above
the narrative, edited in-place as the turn progresses.

**Local** — development adapter. A lightweight web UI served on localhost that
mirrors Telegram's UX: message bubbles, inline keyboard buttons, voice recording,
trace panel. WebSocket for streaming. HTML/CSS/JS, no framework — it's a dev tool.

**Sim** — test adapter. Feeds scripted inputs, captures outputs, asserts on results.
No UI. Used for model comparison and regression testing.

---

## 5. The Narrator (LLM Agent)

The narrator is the DM. It runs as a tool-calling agent loop via OpenRouter
(OpenAI-compatible API). Model choice is configurable per-session via `/model`.

### System Prompt Structure

```
[DM Contract — the non-negotiable rules]
[Narration style directive — based on current mode: verbose/concise]
[Character sheet document — always full, from DB]
[World state document — always full, from DB]
[Scene summaries — "story so far", chronological]
[Combat state — if in combat: initiative order, HP, whose turn]
```

### The DM Contract (system prompt core)

Non-negotiable rules baked into every narrator prompt:

1. NEVER produce a die result, damage number, or modifier. Use `request_roll`.
2. NEVER do arithmetic. The engine handles all math.
3. When requesting a roll, specify the skill/ability name, NOT the modifier value.
4. Always end a narrative beat with `present_forks` (3-5 options).
5. Read character and world state through tools, never from memory/context alone.
6. Bad rolls must have real consequences. A 6 does not "almost succeed."
7. Set DCs based on narrative difficulty, not desired outcome.
8. Use `think` before complex narrative decisions.
9. Call `done` when the turn is complete. Every turn must include one `reply`.
10. During combat, follow the combat state machine — never skip initiative or
    narrate an attack without a roll resolving first.
11. Use `lookup_rule` to verify mechanics you're unsure about. Do not guess.

### Agent Loop

```
while not done:
    response = llm.chat(messages, tools)
    for each tool_call in response:
        if tool_call.name == "done":
            break
        result = dispatch(tool_call)
        append tool_result to messages
```

The engine caps tool-call iterations (default: 20 per turn) to prevent runaway
loops. If the model hits the cap without calling `done`, the engine forces a
graceful end and logs a warning.

### Model Compatibility

The narrator must work with any model that supports tool calling via OpenRouter.
Tested targets (in rough quality order):

- Claude (Opus, Sonnet) — best narration, most reliable tool use
- Gemini (Pro, Flash) — good narration, solid tool compliance
- Qwen3 (235B, 32B) — good with `think` tool, needs more structured prompting
- Llama (70B, 8B) — usable for concise mode, may need retries on tool schema
- Mistral (Large, Small) — decent, benefits heavily from `think` tool

The `think` tool is critical for cheaper/smaller models that don't have built-in
chain-of-thought. Without it, they tend to skip roll requests or hallucinate numbers.

---

## 6. Tool Surface

Every tool the narrator can call. Grouped by purpose.

### Thinking & Control

| Tool | Params | Returns | Notes |
|------|--------|---------|-------|
| `think` | `text: string` | `{ ok: true }` | Scratchpad. Never shown to player. Essential for instruct models. |
| `reply` | `text: string` | `{ ok: true }` | The narrative prose sent to the player. Exactly one per turn. |
| `present_forks` | `forks: Fork[]` | `{ ok: true }` | 3-5 choice options. Engine appends "Other" automatically. |
| `done` | — | — | Signals turn complete. Engine validates that `reply` was called. |

### Dice & Mechanics

| Tool | Params | Returns | Notes |
|------|--------|---------|-------|
| `request_roll` | `skill?: string, ability?: string, type: "check"\|"save"\|"attack"\|"damage"\|"initiative"\|"custom", weapon?: string, dc?: number, advantage?: boolean, disadvantage?: boolean, reason: string` | `RollResult` | Engine resolves everything. Model waits for result. |
| `lookup_rule` | `category: string, name: string` | SRD entry | Query embedded SRD. Categories: "class", "race", "spell", "monster", "condition", "equipment", "action". |

### State Management

| Tool | Params | Returns | Notes |
|------|--------|---------|-------|
| `get_character` | — | Character sheet JSON | Full current state. |
| `get_world` | — | World state JSON | Full current state. |
| `update_character` | `patch: CharacterPatch` | Updated character | HP, ki, add/remove items, spend gold, etc. |
| `update_world` | `patch: WorldPatch` | Updated world | NPCs, flags, scene, story beats. |

### Combat

| Tool | Params | Returns | Notes |
|------|--------|---------|-------|
| `start_combat` | `enemies: EnemySpec[]` | Initiative order | Engine rolls initiative for all. See §8. |
| `end_combat` | `reason: string` | `{ ok: true }` | Exits combat state machine. |
| `enemy_action` | `enemy: string, action: string, target: string` | Roll results | Engine resolves enemy attacks/abilities. |

### Scene Management

| Tool | Params | Returns | Notes |
|------|--------|---------|-------|
| `end_scene` | `summary: string` | `{ ok: true }` | Triggers compaction. Summary stored in scene log. |

### RollResult Shape

```typescript
interface RollResult {
  nat: number;           // natural die value (before modifiers)
  modifier: number;      // looked up from sheet
  total: number;         // nat + modifier
  dc?: number;           // if a DC was set
  success?: boolean;     // total >= dc
  crit: boolean;         // nat 20
  fumble: boolean;       // nat 1
  margin?: number;       // total - dc (positive = over, negative = under)
  advantage?: boolean;   // was advantage applied
  disadvantage?: boolean;
  rolls?: number[];      // all dice rolled (for advantage: both values)
  reason: string;        // echoed back for trace display
}
```

---

## 7. The Resolver (Dice Engine)

Pure functions. No LLM access. No network calls. Uses `crypto.getRandomValues()`
(available in both Workers and Node.js).

### Core Functions

```typescript
// Roll a single die
function rollDie(sides: number): number

// Resolve a full check/save/attack
function resolve(params: {
  type: "check" | "save" | "attack" | "damage" | "initiative" | "custom";
  sides?: number;          // default 20 for checks/saves/attacks
  modifier: number;        // looked up by engine, NOT passed by model
  dc?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  damageDice?: string;     // "2d6+3" for damage rolls
}): RollResult

// Roll ability scores for character creation (4d6 drop lowest, x6)
function rollAbilityScores(): number[]

// Roll initiative for a list of combatants
function rollInitiative(combatants: { name: string; mod: number }[]): InitiativeOrder
```

### The modifier lookup

When the model calls `request_roll({ skill: "stealth", dc: 15 })`, the engine:

1. Looks up the character's stealth modifier from the `characters` table
2. If no stealth modifier exists, falls back to the base ability modifier (DEX for stealth)
3. Passes the modifier to `resolve()`
4. Returns the full `RollResult` to the model

The model receives the modifier in the result (for narration purposes) but never
provides it. If the model includes a modifier in its `request_roll` call, the
engine ignores it and logs a warning.

### Skill-to-ability mapping

Embedded in the resolver, from the SRD:

```
STR: athletics
DEX: acrobatics, sleight_of_hand, stealth
CON: (no skills, but CON saves)
INT: arcana, history, investigation, nature, religion
WIS: animal_handling, insight, medicine, perception, survival
CHA: deception, intimidation, performance, persuasion
```

---

## 8. Combat System

Combat is a state machine managed by the engine, not the narrator.

### States

```
EXPLORATION ─── start_combat() ───▶ ROLLING_INITIATIVE
                                          │
                                          ▼
                                    INITIATIVE_SET
                                          │
                                          ▼
                              ┌───▶ TURN_START (whose turn?)
                              │           │
                              │     ┌─────┴──────┐
                              │     ▼            ▼
                              │  PLAYER_TURN  ENEMY_TURN
                              │     │            │
                              │     ▼            ▼
                              │  (forks)    (enemy_action)
                              │     │            │
                              │     ▼            ▼
                              │  RESOLVING    RESOLVING
                              │     │            │
                              │     └─────┬──────┘
                              │           ▼
                              │     TURN_END
                              │           │
                              │     (next in initiative)
                              └───────────┘
                                          │
                              end_combat() or all enemies dead
                                          │
                                          ▼
                                    EXPLORATION
```

### What the engine enforces

- No attack narration without a preceding `request_roll` that resolved
- No damage applied without a damage roll
- Turn order follows initiative — the model can't skip an enemy's turn
- HP tracking is authoritative — model reads it, engine writes it
- Death at 0 HP triggers death save rules (from SRD), not model narration
- Combat ends when all enemies are dead/fled OR the model calls `end_combat`
  with a narrative reason (surrender, escape, parley)

### Enemy stat blocks

When `start_combat` is called, the engine checks the SRD bestiary for each enemy
name. If found, it uses the canonical stat block. If not found (custom enemy), the
model must provide stats in the `EnemySpec` and the engine stores them for the
duration of the fight.

```typescript
interface EnemySpec {
  name: string;           // "Dock Guard" — looked up in SRD first
  customStats?: {         // only if not in SRD
    ac: number;
    hp: number;
    attacks: AttackSpec[];
    initiativeMod: number;
    saveMods?: Record<string, number>;
  };
}
```

### Player combat actions

On the player's turn, `/abilities` shows a combat-contextual action menu
(rendered statically from character sheet + SRD):

```
⚔️ COMBAT ACTIONS — Sayola (Monk 10)
Ki: 8/10

ATTACKS:
• Unarmed Strike — +9 to hit, 1d6+5
• Quarterstaff — +9 to hit, 1d6+5 (versatile 1d8+5)

BONUS ACTIONS (1 ki each):
• Flurry of Blows — 2 extra unarmed strikes after Attack
• Patient Defense — Dodge as bonus action
• Step of the Wind — Disengage or Dash as bonus action

ON HIT (1 ki):
• Stunning Strike — target CON save DC 17 or stunned 1 round

REACTIONS:
• Deflect Missiles — reduce ranged hit by 1d10+15
• Opportunity Attack — if enemy leaves your reach

MOVEMENT: 45 ft
```

All computed from sheet data + SRD class features. Zero tokens.

---

## 9. State & Storage

### SQLite Schema

```sql
-- One row per campaign/save
CREATE TABLE saves (
    save_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    name TEXT,                    -- campaign name
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Character mechanical data
CREATE TABLE characters (
    save_id TEXT PRIMARY KEY REFERENCES saves(save_id),
    name TEXT NOT NULL,
    race TEXT NOT NULL,
    class TEXT NOT NULL,
    subclass TEXT,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER DEFAULT 0,

    -- Ability scores (base, before racial bonuses — bonuses stored separately)
    str INTEGER, dex INTEGER, con INTEGER,
    int INTEGER, wis INTEGER, cha INTEGER,

    -- Derived stats (engine computes from scores + class + level)
    hp_current INTEGER,
    hp_max INTEGER,
    ac INTEGER,
    speed INTEGER,
    proficiency_bonus INTEGER,

    -- Class resources
    ki_current INTEGER,          -- monk
    ki_max INTEGER,
    spell_slots_json TEXT,       -- JSON for casters
    hit_dice_remaining INTEGER,

    -- Proficiencies
    skill_proficiencies TEXT,    -- JSON array: ["stealth", "acrobatics"]
    save_proficiencies TEXT,     -- JSON array: ["str", "dex"]
    tool_proficiencies TEXT,     -- JSON array

    updated_at TEXT DEFAULT (datetime('now'))
);

-- Inventory as individual rows (queryable)
CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT REFERENCES saves(save_id),
    name TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    unit TEXT,                   -- "ft", "uses", null
    equipped INTEGER DEFAULT 0,
    notes TEXT,
    category TEXT               -- "weapon", "armor", "gear", "quest", "coin"
);

-- Tracked NPCs
CREATE TABLE npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT REFERENCES saves(save_id),
    name TEXT NOT NULL,
    role TEXT,                   -- "first mate", "antagonist", "merchant"
    loyalty INTEGER,            -- 0-100, null if not applicable
    alive INTEGER DEFAULT 1,
    notes TEXT
);

-- World state flags (the secret sauce)
CREATE TABLE flags (
    save_id TEXT REFERENCES saves(save_id),
    key TEXT NOT NULL,
    value TEXT DEFAULT 'true',  -- usually boolean, sometimes a string
    set_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (save_id, key)
);

-- Living documents (character sheet render + world state)
CREATE TABLE documents (
    save_id TEXT REFERENCES saves(save_id),
    doc_type TEXT NOT NULL,      -- 'character' or 'world'
    content TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (save_id, doc_type)
);

-- Scene summaries (compacted narrative history)
CREATE TABLE scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT REFERENCES saves(save_id),
    seq INTEGER NOT NULL,
    scene_id TEXT,              -- "open_water_night_1"
    summary TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Full message history
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT REFERENCES saves(save_id),
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,          -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls_json TEXT,       -- JSON array of tool calls (assistant msgs)
    tool_call_id TEXT,          -- for tool result messages
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_cents REAL,
    model TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Every dice roll (audit trail)
CREATE TABLE rolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id TEXT REFERENCES saves(save_id),
    msg_seq INTEGER,            -- which message triggered this
    check_type TEXT,            -- "stealth", "attack", "initiative"
    notation TEXT,              -- "1d20", "2d6"
    modifier INTEGER,
    dc INTEGER,
    nat INTEGER,
    total INTEGER,
    success INTEGER,            -- 1/0/null
    crit INTEGER DEFAULT 0,
    fumble INTEGER DEFAULT 0,
    reason TEXT,
    rolled_at TEXT DEFAULT (datetime('now'))
);

-- Combat state (active combat only, deleted on end_combat)
CREATE TABLE combat (
    save_id TEXT PRIMARY KEY REFERENCES saves(save_id),
    initiative_order TEXT,       -- JSON array: [{name, roll, mod, total}]
    current_turn INTEGER,       -- index into initiative_order
    round INTEGER DEFAULT 1,
    enemies_json TEXT,          -- JSON: [{name, ac, hp_current, hp_max, ...}]
    state TEXT DEFAULT 'active' -- 'active', 'ended'
);

-- Settings per chat
CREATE TABLE settings (
    chat_id TEXT PRIMARY KEY,
    model TEXT,                 -- OpenRouter model ID
    narration_mode TEXT DEFAULT 'verbose',  -- 'verbose', 'concise'
    traces_enabled INTEGER DEFAULT 1,
    voice_enabled INTEGER DEFAULT 0
);
```

### Storage access pattern

The engine owns all database access. The narrator never queries the DB directly.
It uses `get_character`, `get_world`, `update_character`, `update_world` tools.
The engine translates tool calls into DB operations.

When `update_character` is called, the engine:
1. Applies the patch to the `characters` / `inventory` tables
2. Regenerates the character sheet document (from tables → rendered markdown)
3. Stores the new document in `documents`
4. Returns the updated character state to the model

This means the `documents` table is a **materialized view** — always consistent
with the underlying structured tables.

---

## 10. The Two Documents

### Character Sheet Document

Rendered from `characters` + `inventory` + SRD class data. Template-driven,
not LLM-generated. Injected into the narrator's context every turn.

```markdown
# {name} — Character Sheet
*{race} {class} · {subclass} · Level {level}*

## Stats
- HP: {hp_current}/{hp_max}
- AC: {ac}
- Speed: {speed} ft
- Proficiency: +{proficiency_bonus}

## Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|-----|-----|-----|-----|-----|-----|
| {str} ({str_mod}) | {dex} ({dex_mod}) | ... |

## Skills (proficient marked with ★)
- ★ Stealth: +{stealth_mod}
- ★ Acrobatics: +{acrobatics_mod}
- Persuasion: +{persuasion_mod}
...

## Class Resources
- Ki: {ki_current}/{ki_max}

## Inventory
{rendered inventory list}

## Coin
{rendered coin}
```

### World State Document

Updated by the narrator via `update_world`. This one IS partially LLM-authored
(the narrative portions), but the structured data (NPCs, flags) is template-rendered
from DB tables.

```markdown
# World State

## Current Scene
{scene description — LLM-authored, updated on scene transitions}

## Story So Far
{chronological scene summaries from the scenes table}

## Active NPCs
{rendered from npcs table}

## World Flags
{rendered from flags table — human-readable}

## Notes
{any narrator-authored context that doesn't fit above}
```

---

## 11. Compaction & Long Campaigns

### The problem

A campaign can run for weeks. Message history grows without bound. The narrator
needs continuity but can't have 50K tokens of chat history in its context.

### Three tiers of memory

**Tier 1: Hot context** — the last N messages (configurable, default 20-30).
Full verbatim conversation including tool calls and results. Always in the prompt.
This is the narrator's "working memory."

**Tier 2: Scene summaries** — when the model calls `end_scene(summary)`, the
engine stores the summary in the `scenes` table. All scene summaries are included
in the world state document under "Story So Far." These are cumulative — they
never get compacted further.

**Tier 3: The two documents** — always fully included, never compacted. They ARE
the persistent state. The character sheet is mechanical truth. The world state is
narrative truth.

### Compaction triggers

1. **Scene-based** — the model calls `end_scene` when the narrative naturally
   transitions (leaving a location, time skip, combat ending). This is the
   preferred trigger — it produces the best summaries because the model knows
   where the narrative break is.

2. **Token-based** — if the hot context approaches the token budget (configurable
   per model), the engine forces a compaction. It asks the model to summarize
   the oldest messages in hot context before dropping them. This is the fallback.

3. **Explicit** — the player sends `/reset` to clear hot context and start fresh
   with only the documents and scene summaries. Nuclear option for when context
   gets stale.

### Narrator context budget

```
Total context window (model-dependent, e.g. 128K for Claude)
  - System prompt + DM contract:        ~2K tokens
  - Character sheet document:           ~1-2K tokens
  - World state document:               ~1-3K tokens (grows with scene summaries)
  - Hot context (messages):             remaining budget
  - Response budget:                    ~2-4K tokens reserved
```

For a 128K context model, this leaves ~118K for hot context — hundreds of
messages. For an 8K context model, hot context is tight at ~2-3K, which is
maybe 8-10 messages. Concise mode helps here.

---

## 12. SRD Reference Data

The D&D 5e System Reference Document (SRD 5.1) is released under CC BY 4.0.
We embed the mechanical data as structured JSON, bundled into the Worker.

### Storage: bundled, not queried

SRD data ships with the code as JSON imports. In the Worker, it's in-memory.
Locally, it's imported from disk. No database, no network calls for lookups.

### Data structure

```
srd/
  classes/
    monk.json           # features by level, subclass options, proficiencies,
                        # hit die, ability score priorities
    fighter.json
    rogue.json
    wizard.json
    cleric.json
    bard.json
    barbarian.json
    druid.json
    paladin.json
    ranger.json
    sorcerer.json
    warlock.json
  races/
    tiefling.json       # stat bonuses, traits, speed, languages
    human.json
    elf.json
    dwarf.json
    halfling.json
    gnome.json
    half-orc.json
    half-elf.json
    dragonborn.json
  spells/
    index.json          # spell list with class availability
    stunning_strike.json
    fireball.json
    ...
  monsters/
    index.json          # monster list by CR
    guard.json
    bandit.json
    goblin.json
    ...
  equipment/
    weapons.json        # damage dice, properties, weight
    armor.json          # AC, type, requirements
    gear.json           # adventuring gear
  rules/
    conditions.json     # stunned, prone, grappled, etc.
    actions.json        # dash, dodge, disengage, help, hide, ready
    skills.json         # skill-to-ability mapping, descriptions
    ability_scores.json # modifier table, check/save descriptions
```

### Class JSON shape (example: Monk)

```json
{
  "name": "Monk",
  "hit_die": 8,
  "primary_ability": ["dex", "wis"],
  "save_proficiencies": ["str", "dex"],
  "skill_choices": {
    "count": 2,
    "from": ["acrobatics", "athletics", "history", "insight", "religion", "stealth"]
  },
  "features_by_level": {
    "1": [
      { "name": "Unarmored Defense", "description": "AC = 10 + DEX mod + WIS mod" },
      { "name": "Martial Arts", "description": "..." }
    ],
    "2": [
      { "name": "Ki", "description": "Ki points = monk level", "resource": "ki" },
      { "name": "Flurry of Blows", "cost": "1 ki", "description": "..." },
      { "name": "Patient Defense", "cost": "1 ki", "description": "..." },
      { "name": "Step of the Wind", "cost": "1 ki", "description": "..." }
    ],
    "3": [
      { "name": "Deflect Missiles", "description": "..." },
      { "name": "Monastic Tradition", "subclass_choice": true }
    ]
  },
  "subclasses": {
    "Way of the Open Hand": {
      "features_by_level": {
        "3": [{ "name": "Open Hand Technique", "description": "..." }],
        "6": [{ "name": "Wholeness of Body", "description": "..." }]
      }
    }
  },
  "martial_arts_die": { "1": "1d4", "5": "1d6", "11": "1d8", "17": "1d10" }
}
```

### Lookup behavior

When the model calls `lookup_rule({ category: "class", name: "monk" })`, the
engine returns the full class JSON. For `lookup_rule({ category: "spell",
name: "stunning_strike" })`, it returns the spell entry.

When `/abilities` is invoked, the engine:
1. Reads the character's class, subclass, and level
2. Loads the class JSON from the SRD bundle
3. Filters features to those available at the character's level
4. Computes resource costs and availability (ki remaining, spell slots)
5. Formats and returns — zero LLM involvement

---

## 13. Character Creation (Onboarding)

Triggered by `/new`. A mechanical process with one generative step at the end.

### Flow

**Step 1: Name** (free text)
> "What's your character's name?"

**Step 2: Race** (inline keyboard)
> Eight core races from the SRD. Selecting one shows racial traits (stat bonuses,
> features, speed) rendered from `srd/races/{race}.json`. Confirm or pick again.

**Step 3: Class** (inline keyboard)
> Twelve core classes, each with a one-line pitch rendered from SRD data.
> Selecting one shows a detailed summary (hit die, primary abilities, flavor).
> Confirm or pick again.

**Step 4: Stat Rolling** (fully mechanical)
> Engine rolls 4d6-drop-lowest six times. Displays results. Player assigns them
> to STR/DEX/CON/INT/WIS/CHA via inline keyboard (tap a score, tap an ability).
> Racial bonuses applied automatically. Modifiers computed and shown.

**Step 5: Level** (inline keyboard)
> Options: 1, 3, 5, 7, 10, or type a custom number.
> Engine fills in: HP (hit die rolls at each level), proficiency bonus, class
> features, spell slots, ki, etc. — all from SRD formulas.

**Step 6: Subclass** (inline keyboard, if level ≥ 3)
> Options from the SRD for the chosen class. Descriptions shown on selection.

**Step 7: Skill proficiencies** (inline keyboard, multi-select)
> "Pick {N} skills from: {class skill list}." Engine handles proficiency bonus.

**Step 8: Equipment** (inline keyboard or auto)
> Starting equipment from SRD class entry. Player picks from the standard
> choices (e.g., "Longsword or any martial weapon?").

**Step 9: Backstory** (LLM enters here)
> "Tell me about your character in a sentence or two. What drives them?"
> Player types free text. The narrator reads the mechanical choices and the
> player's input, asks 1-2 follow-up questions, and produces:
> - A personality summary
> - A starting motivation/goal
> - The opening scene proposal

**Step 10: Confirm & begin**
> Engine saves everything to DB, generates both documents, and the narrator
> delivers the opening narration with the first set of forks.

Steps 1-8: static, mechanical, cheap.
Step 9-10: one LLM call to bring the character to life.

---

## 14. Commands

All commands are handled by the engine directly. The LLM is not involved unless
explicitly noted.

### Player Commands

| Command | Static? | Description |
|---------|---------|-------------|
| `/new` | Mostly | Start character creation. Steps 1-8 mechanical, step 9 uses LLM. |
| `/sheet` | Yes | Render full character sheet from DB. |
| `/world` | Yes | Render world state document from DB. |
| `/inventory` | Yes | Quick inventory list from DB. |
| `/abilities` | Yes | Class features + spells filtered by level. Combat-aware. |
| `/roll N` | Yes | Roll a dN. `/roll 20` = d20. `/roll 6` = d6. No modifiers, just raw dice. |
| `/recap` | **LLM** | Model summarizes current state from documents. One of the few token-spending commands. |
| `/concise` | Yes | Toggle concise narration mode. |
| `/verbose` | Yes | Toggle verbose narration mode. |
| `/model` | Yes | Inline keyboard of available OpenRouter models. |
| `/traces` | Yes | Toggle trace message visibility. |
| `/save` | Yes | Explicit save (auto-save happens every turn anyway). |
| `/load` | Yes | List save slots, pick one to load. |
| `/reset` | Yes | Clear hot context, keep documents and scenes. Confirms first. |
| `/undo` | Yes | Rewind last turn — delete last exchange, revert state snapshot. |
| `/help` | Yes | Static command reference. |

### Future / Stretch Commands

| Command | Description |
|---------|-------------|
| `/map` | Render a simple ASCII/text map of the current area |
| `/journal` | Browse scene summaries chronologically |
| `/npc {name}` | Quick NPC lookup from DB |
| `/flag {key}` | Check a world flag value |
| `/export` | Export full campaign as JSON/Markdown |

---

## 15. Traces

Adapted from her-go's trace system. A message displayed ABOVE the narrative that
shows what happened mechanically during the turn.

### Trace content

```
🎲 Stealth Check (d20+9): nat 14 + 9 = 23 vs DC 15 — ✅ pass (+8)
📊 Ki: 10 → 9 (spent 1: Stunning Strike)
📊 HP: 18/18 (no change)
🏴 Flag set: ship_taken = true
👥 NPC updated: Bryn loyalty 45 → 55
⏱ 2.3s · 847 tokens · $0.003 · gpt-4o
```

### Trace slots (render order)

| Order | Slot | Content |
|-------|------|---------|
| 100 | `rolls` | All dice rolls this turn with full breakdown |
| 200 | `state` | Stat changes (HP, ki, resources) |
| 300 | `flags` | World flags set/changed |
| 400 | `npcs` | NPC changes |
| 500 | `combat` | Combat state (initiative, HP bars, whose turn) |
| 600 | `think` | Model's think tool content (optional, off by default) |
| 900 | `meta` | Timing, tokens, cost, model name |

The trace message is edited in-place as the turn progresses (on adapters that
support `messageEdit`). Rolls appear immediately when they resolve, before the
narration is complete.

### Toggling

`/traces` cycles through: full → compact (rolls + meta only) → off.

---

## 16. Voice Memos

### Flow

1. Player records a voice memo in Telegram (or local dev UI)
2. Adapter receives audio (OGG/Opus from Telegram, WebM from browser)
3. Engine sends audio to STT model on OpenRouter (Parakeet or Whisper)
4. Transcript becomes the player's text input — standard pipeline from there
5. Trace shows: `🎤 Voice: "{transcript}"` so the player can verify

### STT Model

Default: Parakeet via OpenRouter. Configurable in settings. The engine
sends raw audio bytes and gets back a transcript string.

### Local dev

The local dev UI uses the browser's `MediaRecorder` API. Record button in the
chat input area. Audio sent to the same STT endpoint via the dev server.

---

## 17. Narration Modes

Controlled by `/concise` and `/verbose`. Affects the system prompt, not the engine.

### Verbose (default)

Full atmospheric narration. Rich descriptions, NPC dialogue, sensory details.
800-1500 tokens per reply. For immersive sessions when you have time.

System prompt addition:
> Write rich, atmospheric prose. Describe the environment, NPC expressions and
> body language, sounds and smells. Give NPCs distinct voices. Let tense moments
> breathe. 2-4 paragraphs per beat.

### Concise

Punchy, fast-paced narration. Action-oriented, minimal description. 200-400
tokens per reply. For mobile, for quick decisions, for cheaper models.

System prompt addition:
> Write tight, punchy narration. One paragraph max. Focus on what changed and
> what's at stake. Skip atmosphere unless it's plot-relevant. Get to the fork fast.

### Recap

Not a mode — a one-shot command. The model reads the two documents and produces a
"previously on..." summary. ~300-500 tokens. Useful after days away from a campaign.

---

## 18. Sim Mode

For testing models, prompts, and mechanics without Telegram.

### Sim adapter

A headless adapter that feeds scripted turns and captures outputs. Same gateway
interface as Telegram — the engine doesn't know it's a sim.

### Sim definition (YAML)

```yaml
name: "Combat flow test"
model: "qwen/qwen3-235b"
character:
  name: "TestMonk"
  race: "Human"
  class: "Monk"
  subclass: "Way of the Open Hand"
  level: 5
  # stats auto-generated or specified
scenario: |
  You are in a dark alley. Two bandits step out of the shadows,
  daggers drawn. "Hand over the coin purse."
turns:
  - input: "I want to fight. Stunning Strike on the nearest bandit."
    assertions:
      - "rolls.length >= 1"
      - "rolls[0].type == 'attack'"
      - "narrator_did_not_produce_number"
  - input: "1"  # pick first fork
    assertions:
      - "combat.state == 'active'"
  - input: "/abilities"
    assertions:
      - "response.static == true"  # no LLM call
      - "response.text contains 'Stunning Strike'"
settings:
  narration_mode: "concise"
  max_turns: 10
```

### Sim runner

```bash
# Run a single sim
npm run sim -- sims/combat_test.yaml

# Run all sims
npm run sim -- sims/

# Compare models on same scenario
npm run sim -- sims/combat_test.yaml --models "claude-sonnet,qwen3-235b,llama-70b"
```

### Sim output

```
=== Combat flow test (qwen/qwen3-235b) ===
Turn 1: ✅ attack roll requested, no hallucinated numbers
Turn 2: ✅ combat state active, forks presented
Turn 3: ✅ static response, abilities listed

Tokens: 2,847 in / 1,203 out
Cost: $0.012
Tool calls: 8 (think: 2, request_roll: 3, reply: 2, done: 1)
Avg response time: 3.2s
```

### What sims test

- **Tool compliance:** Does the model call `request_roll` instead of writing numbers?
- **Contract adherence:** Does every turn include `reply` + `present_forks` + `done`?
- **Math avoidance:** Does the model ever emit a modifier or calculate a total?
- **Narration quality:** (Manual review, but sims capture outputs for comparison)
- **Token efficiency:** How many tokens per turn? How does concise mode compare?
- **Combat correctness:** Does the model follow initiative order and use combat tools?
- **Model comparison:** Same scenario, different models, side-by-side results

---

## 19. Cloudflare Deployment

### Worker

The main entry point. Handles:
- Telegram webhook (`POST /webhook`)
- Request routing
- Short-lived operations (most turns complete in <30s)

```typescript
// worker/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Route: webhook, health check, etc.
  }
}
```

### D1

SQLite database. Same schema as local development. Bound as `env.DB`.

### Durable Objects

For turns that exceed the Worker CPU time limit (30s on paid plan). The Worker
hands off to a Durable Object when it detects the narrator is chaining many
tool calls (complex combat, multi-roll sequences).

```typescript
export class GameSession implements DurableObject {
  // Long-running narrator loop
  // Owns the WebSocket to the client (if streaming)
  // Falls back here when Worker would timeout
}
```

**When to use DO vs Worker:**
- Simple turns (1-3 tool calls): Worker handles directly
- Complex turns (combat rounds, multi-roll sequences): Worker creates/resumes
  a Durable Object session
- The engine detects complexity and escalates — the adapter doesn't know

### KV (optional)

For caching SRD data if the bundle size becomes a concern. Not needed initially.

### Secrets

OpenRouter API key stored as a Worker secret (`wrangler secret put OPENROUTER_KEY`).
Telegram bot token likewise.

---

## 20. Local Development

### Dev server

A Node.js server that runs the same engine code as the Worker, with:
- SQLite on disk (`tavern.db`)
- Local dev UI on `http://localhost:3000`
- Hot reload on code changes
- Same SRD bundle (imported from disk)

### Local dev UI

A single-page web app that mirrors Telegram's chat UX:

- Left-aligned narrator messages (markdown rendered)
- Right-aligned player messages
- Inline keyboard buttons for forks (3-5 + Other)
- Trace panel above the conversation (collapsible)
- Voice record button (MediaRecorder → STT)
- Command input with `/` autocomplete
- Character sheet slide-out panel
- Dark theme (it's a tavern)

Tech: vanilla HTML/CSS/JS + WebSocket. No build step. Served by the dev server.
This is a development tool, not a product — keep it simple.

### Running locally

```bash
# Install dependencies
npm install

# Start dev server (local UI + SQLite)
npm run dev

# Run with Telegram polling (for testing the real adapter locally)
npm run dev:telegram

# Run sims
npm run sim -- sims/
```

### Environment

```
.env.local:
  OPENROUTER_API_KEY=sk-or-...
  TELEGRAM_BOT_TOKEN=...       # optional for local
  STT_MODEL=openai/whisper-1   # or deepgram/parakeet
```

---

## 21. Project Structure

```
tavern/
├── docs/                      # Source documents from original session
│   ├── ARCHITECTURE.md        # Original design doc (reference only)
│   ├── sayola_sheet.md        # Character state reference
│   └── roll.py                # Dice roller prototype (Python, reference)
│
├── src/
│   ├── gateway/
│   │   ├── types.ts           # InboundMsg, OutboundMsg, Fork, CapSet
│   │   ├── gateway.ts         # Router: adapter → engine → adapter
│   │   └── adapter.ts         # Adapter interface
│   │
│   ├── engine/
│   │   ├── engine.ts          # Turn orchestration, context building
│   │   ├── context.ts         # Prompt assembly (documents + history + system)
│   │   └── turn.ts            # Turn lifecycle, tool dispatch loop
│   │
│   ├── narrator/
│   │   ├── client.ts          # OpenRouter LLM client
│   │   ├── prompt.ts          # System prompt templates
│   │   └── tools.ts           # Tool definitions (JSON Schema for the model)
│   │
│   ├── resolver/
│   │   ├── dice.ts            # Core RNG: rollDie, resolve
│   │   ├── skills.ts          # Skill-to-ability mapping, modifier lookup
│   │   └── character.ts       # Character stat computation from sheet + SRD
│   │
│   ├── combat/
│   │   ├── state.ts           # Combat state machine
│   │   ├── initiative.ts      # Initiative rolling and ordering
│   │   └── actions.ts         # Combat action resolution
│   │
│   ├── state/
│   │   ├── db.ts              # SQLite/D1 connection + migrations
│   │   ├── store.ts           # CRUD operations on all tables
│   │   ├── documents.ts       # Document rendering (tables → markdown)
│   │   └── migrations/        # Forward-only SQL migrations
│   │       ├── 001_initial.sql
│   │       └── ...
│   │
│   ├── srd/
│   │   ├── loader.ts          # Load + index SRD data
│   │   ├── lookup.ts          # Query interface for model + commands
│   │   ├── classes/           # JSON per class
│   │   ├── races/             # JSON per race
│   │   ├── spells/            # JSON per spell
│   │   ├── monsters/          # JSON per monster
│   │   ├── equipment/         # Weapons, armor, gear
│   │   └── rules/             # Conditions, actions, skills
│   │
│   ├── trace/
│   │   ├── board.ts           # Per-turn trace board (adapted from her-go)
│   │   └── registry.ts        # Named slots with render ordering
│   │
│   ├── adapters/
│   │   ├── telegram/
│   │   │   ├── adapter.ts     # Telegram adapter (webhook)
│   │   │   ├── keyboards.ts   # Inline keyboard builder for forks
│   │   │   └── voice.ts       # Voice memo download + STT dispatch
│   │   ├── local/
│   │   │   ├── adapter.ts     # Local dev adapter (WebSocket)
│   │   │   ├── server.ts      # HTTP server for dev UI
│   │   │   └── ui/            # HTML/CSS/JS for the Telegram-clone UI
│   │   └── sim/
│   │       ├── adapter.ts     # Sim adapter (scripted I/O)
│   │       ├── runner.ts      # Sim execution + assertions
│   │       └── reporter.ts    # Results formatting
│   │
│   ├── commands/
│   │   ├── registry.ts        # Command dispatch
│   │   ├── sheet.ts           # /sheet — render character
│   │   ├── world.ts           # /world — render world state
│   │   ├── inventory.ts       # /inventory
│   │   ├── abilities.ts       # /abilities — SRD + sheet → formatted list
│   │   ├── roll.ts            # /roll N — manual dice
│   │   ├── model.ts           # /model — model picker
│   │   └── help.ts            # /help — static text
│   │
│   ├── onboarding/
│   │   ├── flow.ts            # Character creation state machine
│   │   ├── rolls.ts           # 4d6-drop-lowest, HP rolling
│   │   └── templates.ts       # Race/class selection display
│   │
│   ├── voice/
│   │   └── stt.ts             # OpenRouter STT client
│   │
│   └── worker/
│       └── index.ts           # Cloudflare Worker entry point
│
├── sims/                      # Sim definitions (YAML)
│   ├── combat_test.yaml
│   ├── narration_test.yaml
│   └── tool_compliance.yaml
│
├── wrangler.toml              # Cloudflare config
├── package.json
├── tsconfig.json
├── SPEC.md                    # This file
├── CLAUDE.md                  # Claude Code instructions
└── .env.local                 # Local secrets (gitignored)
```

---

## 22. Build Order

Smallest shippable steps. Each step produces something testable.

### Phase 1: Foundation
1. **Project scaffolding** — package.json, tsconfig, wrangler.toml, CLAUDE.md
2. **Resolver module + tests** — `dice.ts`, `skills.ts`. Pure functions, no dependencies. Port `roll.py` logic to TS with `crypto.getRandomValues()`. Table-driven tests.
3. **State layer** — SQLite schema, migrations, CRUD store. Local SQLite via `better-sqlite3`.
4. **SRD data** — Import a subset of the 5e SRD. Start with one class (Monk), one race (Tiefling), core rules. Expand later.

### Phase 2: Engine
5. **Document renderer** — tables → markdown templates for both documents.
6. **Narrator client** — OpenRouter client with tool-calling loop. Test with a simple "describe a tavern" prompt before wiring game logic.
7. **Tool dispatch** — implement all tools (think, reply, request_roll, etc.). Resolver wired to the `request_roll` tool.
8. **Context builder** — assemble the full narrator prompt from documents, history, and system prompt.

### Phase 3: Playable
9. **Gateway + CLI adapter** — minimal adapter that reads from stdin, writes to stdout. The "terminal game" proof of concept.
10. **Commands** — static command handlers (/sheet, /inventory, /abilities, /roll, /help).
11. **Onboarding** — character creation flow via the CLI adapter.
12. **Combat state machine** — initiative, turn tracking, combat tools.

### Phase 4: Telegram
13. **Telegram adapter** — webhook handler, inline keyboards, message sending.
14. **Trace board** — per-turn trace message with edit-in-place.
15. **Voice memos** — Telegram audio download + STT.
16. **Local dev UI** — the Telegram-clone web interface for development.

### Phase 5: Deploy
17. **Worker entry point** — wire gateway to Cloudflare Worker fetch handler.
18. **D1 migration** — ensure schema works on D1, test reads/writes.
19. **Durable Object** — long-running turn escalation for complex combat.
20. **Production deploy** — wrangler publish, set secrets, register webhook.

### Phase 6: Polish
21. **Sim runner** — sim adapter + YAML definitions + assertion engine.
22. **Model comparison** — run sims across multiple models, tune prompts.
23. **Full SRD import** — all 12 classes, all races, full spell list, bestiary.
24. **Undo system** — state snapshots before each turn, rewind on `/undo`.
25. **Save slots** — multiple campaigns per chat.

### Stretch
26. **Multiplayer** — additional LLM agents as party members with their own character sheets and tool access.
27. **Discord adapter** — same gateway, different transport.
28. **Map generation** — simple text/ASCII maps of locations.
29. **Campaign templates** — pre-built starting scenarios (pirate, dungeon crawl, political intrigue).
