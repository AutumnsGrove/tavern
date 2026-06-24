# Tavern

D&D-flavored CYOA game engine. See SPEC.md for full architecture.

## Quick Reference

- **Language:** TypeScript (Cloudflare Workers runtime)
- **Package manager:** pnpm (do NOT use npm or yarn)
- **Runtime:** Cloudflare Workers + Durable Objects + D1 + KV
- **Local dev:** `pnpm dev` (runs wrangler dev / Miniflare — full CF runtime locally)
- **Tests:** `pnpm test` (vitest)
- **Type check:** `pnpm typecheck`
- **Deploy:** `pnpm deploy` (wrangler deploy)

## Architecture

- **Worker** (`src/worker.ts`) — thin webhook receiver, routes to Durable Object
- **GameSession DO** (`src/session.ts`) — runs the full game engine per chat
- **Resolver** (`src/resolver/`) — dice rolling via crypto.getRandomValues(). Pure functions. No LLM access.
- **State** (`src/state/`) — D1 CRUD. All persistent storage.
- **SRD** (`src/srd/`) — D&D 5e reference data. Stored in KV, cached in DO memory.
- **Narrator** (`src/narrator/`) — LLM agent loop via OpenRouter. Tool calling.
- **Gateway** (`src/gateway/`) — adapter interface, message types, command registry
- **Adapters** (`src/adapters/`) — telegram, local dev UI, sim runner

## Core Rules (enforced in code, not just prompts)

1. The LLM never rolls dice — it emits `request_roll`, the resolver rolls
2. The LLM never does math — modifiers come from the character sheet via engine lookup
3. Static over generated — /sheet, /inventory, /abilities render from DB, zero tokens
4. The SRD is the rules lawyer — mechanics from embedded 5e SRD data, not training data

## Commands

```bash
pnpm install          # install deps
pnpm dev              # local dev server (Miniflare)
pnpm test             # run tests
pnpm test:watch       # run tests in watch mode
pnpm typecheck        # type check
pnpm run srd:seed     # seed local KV with SRD data
pnpm run db:migrate   # run D1 migrations locally
pnpm deploy           # deploy to Cloudflare
```

## Secrets

Local secrets in `.dev.vars` (gitignored):
```
OPENROUTER_API_KEY=sk-or-...
TELEGRAM_BOT_TOKEN=...
```

Production secrets via `wrangler secret put <KEY>`.
