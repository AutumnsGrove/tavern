# The Maiden's Revenge — Game Architecture

A repeatable, Telegram-playable CYOA/TTRPG engine. The session you just played, as a system.

## The Core Loop (this is the whole game)

```
player intent (free text)
      │
      ▼
┌─────────────────┐   narrator decides WHAT to resolve, not the outcome
│  NARRATOR (LLM) │──▶ emits structured "roll request(s)" + pending narration
└─────────────────┘
      │
      ▼
┌─────────────────┐   YOUR code. LLM never touches RNG.
│  RESOLVER       │──▶ secrets-based dice, applies modifiers, returns result
└─────────────────┘
      │
      ▼
┌─────────────────┐   narrator weaves result into fiction, proposes 2-4 forks
│  NARRATOR (LLM) │──▶ prose + options
└─────────────────┘
      │
      ▼
┌─────────────────┐   persist: sheet, scene, NPCs, flags, ship state
│  STATE STORE    │
└─────────────────┘
```

The discipline that made tonight work: **the model requests rolls, the engine rolls.**
Never let the LLM emit a number. It emits `{check: "stealth", mod: 9, dc: 15}` and waits.

## The Three Pieces

### 1. State Store
Everything that was in `sayola_sheet.md` becomes structured JSON. One doc per save.

```json
{
  "save_id": "uuid",
  "chat_id": 123456,                  // Telegram chat
  "character": {
    "name": "Sayola", "class": "Monk", "level": 10,
    "hp": {"cur": 18, "max": 18}, "ac": 15,
    "ki": {"cur": 10, "max": 10},
    "mods": {"stealth": 9, "acrobatics": 9, "persuasion": 5, "athletics": 4}
  },
  "inventory": [ {"id":"rope","name":"hemp rope","qty":30,"unit":"ft"} ],
  "npcs": [ {"id":"reka","name":"Reka","role":"first mate","loyalty":85,"alive":true} ],
  "flags": {"manifest_dead_drop": true, "ship_taken": true, "quill_alerted": false},
  "ship": {"name":"Maiden's Revenge","stores_days":58,"heading":"Havana","crew":7},
  "scene": "open_water_night_1",
  "log": [ "...recent beats for narrator context..." ]
}
```

Flags are the secret sauce — they're how the world remembers your choices.
`quill_alerted`, `kid_recruited`, `bryn_loyalty` all change what's possible later.

### 2. Resolver (you already wrote the seed of this)
`roll.py` is the prototype. Productionize it into a pure function:

```python
def resolve(check_type, modifier=0, dc=None, advantage=None) -> RollResult:
    # secrets-based d20, apply mod, compare to dc, flag nat1/nat20
    # returns {nat, total, success, crit, margin}
```

Keep it a separate module the narrator literally cannot import. The Telegram
bot orchestrates: gets roll-request from LLM → calls resolve() → sends result back.

### 3. Narrator (the LLM)
A system prompt that encodes the DM contract. The non-negotiables from tonight:
- NEVER produce a die number. Request rolls via a strict schema.
- Always end a beat with 2-4 forks (+ "something else").
- Read & write state through tools, never from memory.
- Modifiers come from the sheet, not vibes.
- Bad rolls must bite — a 6 means the world pushes back.

Tool surface for the narrator:
  get_state()           → current save JSON
  request_roll(spec)    → engine resolves, returns result  (LLM waits)
  update_state(patch)   → apply changes (hp, ki, inventory, flags, npcs)
  append_log(beat)      → short memory for continuity

## Telegram Shape

- One **chat = one save**. `chat_id` is the save key. Clean and natural.
- `/new` start a character, `/sheet` render the sheet, `/save` `/load` if you want slots.
- Inline keyboard buttons = the 2-4 forks. Tapping sends the choice back. (This is
  literally the `ask_user_input_v0` pattern — buttons beat typing on mobile.)
- Roll results render as a little card: 🎲 Stealth (d20+9): **14** vs DC 15 — *miss*.
- Stream narration in chunks; Telegram has a 4096-char message cap, so paginate beats.

## Stack Suggestion (your toolbox)
- **python-telegram-bot** (v21+, async) — mature, clean handlers.
- **Anthropic API** for the narrator. Tool use = the roll-request mechanism, enforced
  by schema so the model *can't* freehand a number.
- **SQLite** (or Cloudflare D1, since you live there) — one row per save, JSON column.
  This maps perfectly onto Grove/Loom if you want it as a Grove service later.
- Resolver stays a plain importable module with zero LLM access.

## Why the LLM-never-rolls rule matters
You caught me hand-waving 18s and 20s. A model left to narrate *and* roll will
unconsciously serve the story over the odds — it wants you to succeed. Pulling RNG
into deterministic code is what makes the tension real. Treat the narrator as a
referee who calls for a save and an honest d20 that answers it. That single
boundary is 80% of what makes this feel like a game instead of fan-fiction.

## Build Order (smallest shippable steps — ADHD-friendly)
1. Resolver module + tests. (You have the seed.) Pure, boring, done.
2. State store: load/save JSON to SQLite by chat_id. CRUD only, no LLM yet.
3. Narrator loop in a TERMINAL first — prove the request_roll handshake works
   with no Telegram noise. This is where the real design risk lives.
4. Wrap in Telegram: text in, buttons out, roll-cards.
5. Polish: /sheet rendering, save slots, death/retry, multiplayer later.

Get step 3 right and the rest is plumbing you already know how to lay.
