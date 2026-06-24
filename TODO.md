# Tavern — TODO

## Done

- [x] Project scaffolding (pnpm, tsconfig, wrangler.toml, CLAUDE.md)
- [x] Resolver: dice engine with crypto RNG (rollDie, resolve, resolveDamage, rollInitiative)
- [x] Resolver: skill-to-ability mapping, modifier lookup, proficiency bonus
- [x] SRD: downloaded full 5e-database (12 classes, 9 races, 319 spells, 334 monsters)
- [x] SRD: KV loader with in-memory caching
- [x] State: full D1 schema (saves, characters, inventory, npcs, flags, documents, scenes, messages, rolls, combat, settings)
- [x] State: typed GameStore CRUD
- [x] State: document renderer (character sheet + world state from DB tables)
- [x] Narrator: OpenRouter client with tool-calling support
- [x] Narrator: agent loop (dispatch, retry, max iterations, token tracking)
- [x] Narrator: 15 tools split into individual files (her-go pattern)
- [x] Narrator: DM contract system prompt with verbose/concise modes
- [x] Engine: context builder (system prompt + documents + history + combat state)
- [x] Engine: turn handler wiring narrator to resolver + state + SRD
- [x] Gateway: adapter interface, message types, command registry
- [x] Commands: /help, /sheet, /world, /inventory, /abilities, /roll, /concise, /verbose, /traces
- [x] Commands: /new (quick character creation with 4d6-drop-lowest)
- [x] Config: src/config.ts — all tunable values in one place (Data Primacy)
- [x] CLI adapter: local D1 + KV wrappers, readline game loop
- [x] Published to GitHub (AutumnsGrove/tavern)

## Up Next — Make It Real

### Trace Board
- [x] Port her-go trace system: named slots with render ordering
- [x] Trace slots: rolls, state changes, flags, npcs, combat, meta
- [x] Wire trace board into turn handler (replace plain traceLines array)
- [x] Telegram trace rendering (edit-in-place message above narrative)

### /model Command
- [x] /model shows numbered list of available models from config (with ◀ marker)
- [x] Selection by number or fuzzy name match, updates settings table

### /undo Command
- [x] Snapshot state before each turn (character, inventory, flags, resources)
- [x] /undo reverts to pre-turn snapshot and deletes last message pair

### Class Resources (all classes, not just ki)
- [x] Generic resource system: ResourceMap with current/max/restoresOn
- [x] Build resources from SRD Levels data (ki, rage, sorcery points, spell slots, action surge, channel divinity, etc.)
- [x] /new populates class_resources_json from SRD on character creation
- [x] update_character tool: spend_resource action with engine validation
- [x] Character sheet renders all resources with short/long rest labels
- [x] /rest command: short or long rest restores appropriate resources
- [x] Legacy backwards compat for existing saves without resources

### Interactive Onboarding (/new revamp)
- [ ] Step-by-step character creation flow with inline keyboards
- [ ] Race selection: show racial traits from SRD on pick
- [ ] Class selection: show class summary from SRD on pick
- [ ] Stat rolling: display 4d6-drop-lowest results, assign via keyboard
- [ ] Level selection: engine fills HP, features, resources from SRD
- [ ] Subclass selection (if level ≥ 3): options from SRD
- [ ] Skill proficiency selection: multi-pick from class skill list
- [ ] Equipment selection: starting gear from SRD class entry
- [ ] Backstory: LLM asks 1-2 questions, generates personality + opening scene

### Combat System
- [x] Combat engine: SRD bestiary lookup for enemy stat blocks
- [x] start_combat tool: expand enemy counts, roll initiative, store state
- [x] Initiative rolling and turn order tracking
- [x] enemy_action tool: resolve enemy attacks via resolver, apply damage
- [x] HP tracking for enemies (stored in combat table as JSON)
- [x] Crit/fumble handling, damage doubling on crits
- [x] Turn advancement (advanceTurn)
- [x] damageEnemy + allEnemiesDown helpers
- [x] Death saving throws (auto-roll at 0 HP, nat 20 revive, nat 1 double fail, damage-at-0 failures)
- [x] /abilities: class-agnostic combat action menu (weapons, resources, class specials, reactions)

### Compaction
- [x] Scene-based compaction: end_scene triggers message trimming
- [x] Token-based compaction: auto-trim when hot context exceeds budget
- [x] /reset command: clear hot context, keep documents and scenes
- [x] Configurable token budget and keep-messages count

## Telegram Adapter

### Webhook Setup
- [x] Telegram Bot API client (typed fetch wrapper, all endpoints)
- [x] Parse Telegram Update → InboundMsg (text, callback_query, voice)
- [x] Wire GameSession DO to parse Telegram webhook payloads
- [x] Send narrative responses via Telegram Bot API
- [x] Register webhook URL with Telegram (`/register-webhook` endpoint)
- [ ] Command buttons for common actions (persistent keyboard)

### Inline Keyboards
- [x] Render forks as inline keyboard buttons
- [x] Handle callback_query for button taps
- [x] Always append "Other" button that prompts free text

### Trace Messages
- [x] Send trace as a separate message above narrative
- [x] Edit trace in-place (update existing message)
- [x] Respect /traces toggle

### Voice Memos
- [x] Download OGG/Opus from Telegram file API
- [x] Send to STT model on OpenRouter (Parakeet)
- [x] Inject transcript as player text input
- [x] Show transcript in trace: 🎤 Voice: "{text}"

### Message Handling
- [x] Paginate long narratives (Telegram 4096 char limit)
- [x] Typing indicator while narrator thinks (re-sends every 4s)
- [x] Error messages for API failures

## Local Dev UI (Telegram Clone)

- [ ] HTML/CSS/JS page served on localhost in dev mode
- [ ] Message bubbles (left = narrator, right = player)
- [ ] Inline keyboard buttons for forks
- [ ] Trace panel (collapsible, above conversation)
- [ ] Voice record button (MediaRecorder → STT)
- [ ] Command input with / autocomplete
- [ ] Character sheet slide-out panel
- [ ] Dark theme
- [ ] WebSocket for streaming

## Cloudflare Deploy

- [x] Wire GameSession DO with full engine (commands + narrator + adapter)
- [ ] D1 migration on first request
- [ ] KV SRD seed script for production
- [ ] `wrangler deploy` + `wrangler secret put`
- [ ] Register Telegram webhook to production URL

## Sim Mode

- [ ] Sim adapter: scripted inputs, captured outputs
- [ ] YAML sim definition format (character, turns, assertions)
- [ ] Sim runner: `pnpm run sim -- sims/test.yaml`
- [ ] Assertions: rolls_made, narrator_did_not_produce_number, static_response
- [ ] Model comparison: same scenario across multiple models
- [ ] Token/cost reporting per sim run

## Stretch

- [ ] /save and /load: multiple save slots per chat
- [ ] /recap command: LLM-generated "previously on..." summary
- [ ] /journal: browse scene summaries chronologically
- [ ] /npc {name}: quick NPC lookup
- [ ] /export: full campaign as JSON/Markdown
- [ ] Campaign templates: pre-built starting scenarios
- [ ] Multiplayer: LLM agents as party members with their own sheets
- [ ] Discord adapter
