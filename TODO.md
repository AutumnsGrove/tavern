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
- [ ] Port her-go trace system: named slots with render ordering
- [ ] Trace slots: rolls, state changes, flags, npcs, combat, meta
- [ ] Wire trace board into turn handler (replace plain traceLines array)
- [ ] Telegram trace rendering (edit-in-place message above narrative)

### /model Command
- [ ] /model shows inline keyboard (or numbered list in CLI) of available models from config
- [ ] Selection updates settings table and takes effect next turn

### /undo Command
- [ ] Snapshot state before each turn (character, inventory, flags, npcs)
- [ ] /undo reverts to pre-turn snapshot and deletes last message pair

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
- [ ] Combat state machine (exploration → initiative → turns → end)
- [ ] start_combat tool: SRD bestiary lookup for enemy stat blocks
- [ ] Initiative rolling and turn order tracking
- [ ] enemy_action tool: resolve enemy attacks/abilities via resolver
- [ ] HP tracking for enemies (stored in combat table)
- [ ] Death/unconsciousness rules from SRD
- [ ] /abilities shows combat-contextual action menu during fights

### Compaction
- [ ] Scene-based compaction: end_scene stores summary, trims old messages
- [ ] Token-based compaction: auto-trim when hot context approaches budget
- [ ] /reset command: clear hot context, keep documents and scenes

## Telegram Adapter

### Webhook Setup
- [ ] Wire GameSession DO to parse Telegram webhook payloads
- [ ] Send narrative responses via Telegram Bot API
- [ ] Register webhook URL with Telegram (`setWebhook`)

### Inline Keyboards
- [ ] Render forks as inline keyboard buttons
- [ ] Handle callback_query for button taps
- [ ] Always append "Other" button that prompts free text
- [ ] Command buttons for common actions

### Trace Messages
- [ ] Send trace as a separate message above narrative
- [ ] Edit trace in-place as tool calls resolve (roll results appear live)
- [ ] Respect /traces toggle

### Voice Memos
- [ ] Download OGG/Opus from Telegram file API
- [ ] Send to STT model on OpenRouter (Parakeet/Whisper)
- [ ] Inject transcript as player text input
- [ ] Show transcript in trace: 🎤 Voice: "{text}"

### Message Handling
- [ ] Paginate long narratives (Telegram 4096 char limit)
- [ ] Typing indicator while narrator thinks
- [ ] Error messages for API failures

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

- [ ] Wire GameSession DO with full engine (currently a stub)
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
