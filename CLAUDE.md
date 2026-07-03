# Tavern

D&D-flavored CYOA game engine. See SPEC.md for full architecture, PRODUCT.md for design principles, DESIGN.md for visual system.

## Quick Reference

- **Language:** TypeScript (Cloudflare Workers runtime for production, Node.js for local dev)
- **Package manager:** pnpm (do NOT use npm or yarn)
- **Runtime:** Cloudflare Workers + Durable Objects + D1 + KV
- **Default model:** xiaomi/mimo-v2.5 via OpenRouter (native provider routing enabled)
- **Tests:** `pnpm test` (vitest, 184 tests)
- **Type check:** `pnpm typecheck` (checks both server and client tsconfigs)

## Commands

```bash
pnpm install          # install deps
pnpm dev:ui           # local dev UI with Vite HMR (port 7777)
pnpm test             # run tests
pnpm test:watch       # run tests in watch mode
pnpm typecheck        # type check (server + client)
pnpm run sim <yaml>   # run a sim scenario (e.g. pnpm run sim sims/exploration.yaml)
pnpm dev              # wrangler dev (Cloudflare Workers local)
pnpm run srd:seed     # seed local KV with SRD data
pnpm run db:migrate   # run D1 migrations locally
pnpm deploy           # deploy to Cloudflare
```

## Development Workflow

**Play-test locally:** `pnpm dev:ui` starts the game server with Vite on port 7777. Open http://localhost:7777. The UI has hot reload — edit any file in `src/devui/client/` and changes appear instantly. Use `/new` to create a character and start playing. The side panel (toggle button in header) shows character sheet, inventory, and world state without needing commands.

**Test with the sim:** Write a YAML scenario in `sims/`, then run `pnpm run sim sims/your-scenario.yaml`. The sim runs through the REAL pipeline (same code path as the dev UI and Telegram) and generates a markdown report in `sims/results/` with full tool traces, costs, cache rates, and compliance checks. Use `--model` flag to compare models. This is the primary way to test prompt changes and narrator behavior without manually playing.

**Type checking:** `pnpm typecheck` runs two passes — the main tsconfig (Cloudflare Workers types, excludes browser client) and `src/devui/tsconfig.client.json` (DOM types for the browser client). Both must pass.

## Architecture

### Hexagonal (Ports & Adapters)

The engine doesn't know about Telegram, the dev UI, or the sim. A unified `dispatch()` function (`src/gateway/dispatch.ts`) handles all input routing: onboarding → commands → narrator. Every adapter calls the same function.

- **Gateway dispatch** (`src/gateway/dispatch.ts`) — single entry point for all adapters
- **Adapters** — Telegram (`src/telegram/`), Dev UI (`src/devui/`), Sim (`src/adapters/sim/`)
- **Engine** (`src/engine/`) — turn orchestration, context building, compaction
- **Narrator** (`src/narrator/`) — LLM agent loop, tool calling, prompt assembly
- **Resolver** (`src/resolver/`) — dice rolling, modifier lookup. Pure functions, no LLM.
- **State** (`src/state/`) — D1/SQLite CRUD. All persistent storage.
- **SRD** (`src/srd/`) — D&D 5e reference data in KV, cached in memory.
- **Combat** (`src/combat/`) — state machine, initiative, death saves
- **Commands** (`src/commands/`) — static commands (no LLM): /sheet, /inventory, /abilities, etc.

### Narrator Loop (`src/narrator/loop.ts`)

The narrator runs a tool-calling loop until the model calls `done`. After the main loop, two nudges fire:

1. **State nudge** — if `update_world` wasn't called, forces the model to persist the current scene description. If mechanical tools fired without `update_character`, forces HP/inventory persistence. This runs on EVERY turn.
2. **Fork nudge** — if `present_forks` wasn't called, forces the model to provide player choices.

The loop supports both the `reply` tool (model calls `reply(text)`) and inline content (model writes prose in message content). Both paths work; the reply tool is preferred via prompt guidance.

### Dev UI (`src/devui/`)

Split into modular TypeScript files under `src/devui/client/`:
- `dom.ts` — DOM refs and shared state
- `ws.ts` — WebSocket connect and message dispatch
- `messages.ts` — chat bubble rendering, history loading
- `markdown.ts` — inline markdown renderer
- `keyboard.ts` — fork button rendering
- `stream.ts` — streaming response handling
- `panel.ts` — side panel (sheet/inventory/world tabs)
- `input.ts`, `autocomplete.ts`, `voice.ts`, `trace.ts`

Styles in `src/devui/styles/index.css`. Design follows DESIGN.md (Lamplit Table theme).

The server (`src/devui/server.ts`) embeds Vite middleware and the game WebSocket on a single port. Chat history loads on connect and persists across page refreshes.

## Core Rules (enforced in code, not just prompts)

1. The LLM never rolls dice — it emits `request_roll`, the resolver rolls via `crypto.getRandomValues()`
2. The LLM never does math — modifiers come from the character sheet via engine lookup
3. Static over generated — /sheet, /inventory, /abilities render from DB, zero tokens
4. The SRD is the rules lawyer — mechanics from embedded 5e SRD data, not training data
5. Skill names are normalized — `sleight of hand`, `Sleight-of-Hand`, `sleight_of_hand` all resolve correctly

## Provider Routing

Models with native endpoints get forced to their native provider for best caching and pricing. Configured in `src/config.ts` under `providerRouting`. DeepSeek and Xiaomi models route to their native endpoints. Cache hit rates of 80-92% are typical.

## Secrets

Local secrets in `.dev.vars` (gitignored):
```
OPENROUTER_API_KEY=sk-or-...
TELEGRAM_BOT_TOKEN=...
```

Production secrets via `wrangler secret put <KEY>`.
