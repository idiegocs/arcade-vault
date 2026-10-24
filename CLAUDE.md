# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Keep this file short (< ~8 KB).** It's an index, not a manual: one line per item plus a link. Details belong in the linked spec, skill, agent or reference file — never duplicate them here (no game lists, version numbers or "latest spec" counters).

## Project

Arcade Vault — a platform for playing games online and competing on points/leaderboards (per README, in Spanish). The app version lives in `package.json` (single source of truth; history in `CHANGELOG.md`). Supabase-backed auth, scores and game catalog, plus real game engines behind a pluggable contract (`components/games/game-engine.ts`, registered in `components/games/registry.ts`; how to wire one in: `components/games/README.md`). Catalog entries without an engine fall back to the static mock HUD in `app/juegos/[id]/jugar/page.tsx`.

Key rules:

- **[`references/juegos-implementados.md`](references/juegos-implementados.md)** is the source of truth for which games have a real engine. Update it whenever a game is added to/removed from `registry.ts` or the `games` table.
- **Score caps:** `saveScore` (`app/actions/scores.ts`) rejects scores above the game's `maxPlausibleScore` from its `registry.ts` entry; no entry ⇒ every score rejected (fail-closed, intentional — spec 11).
- **Per-game, not platform:** sounds (`defineSounds` from `components/games/audio.ts`), background music (spec 13), skins `clasico`/`neon`/`retro` (CAÍDA is the reference) and `touchControls` (spec 12) all live in each game's engine/registry entry. Adding a game never touches `audio.ts` or `scores.ts`.
- **Performance:** new engines follow the "Rendimiento" rules in `components/games/README.md` (spec 14: freeze after game over, cached background/glow, allocation-free `draw`). Dev-only FPS counter in the player; `@game-performance-booster` logs its runs in `references/rendimiento-juegos.md` (created on its first run).

## Knowledge graph (Graphify)

`graphify-out/` (gitignored) holds a knowledge graph of the repo — start from `graphify-out/GRAPH_REPORT.md`, then `graphify query|path|explain|affected "<X>"` (or `/graphify`) **before reading files one by one**. Missing? Run `graphify extract . --code-only`, then `graphify cluster-only . --no-label` (code only, no LLM; needs `pipx install "graphifyy[sql]"`), or `/graphify .` for the full graph including specs/docs (uses LLM tokens). Stale: `graphify update .` after code changes, `/graphify .` after spec/doc changes. Always confirm against the source before editing.

## Skills & agents

Usa siempre el /frontend-design para hacer interfaz de usuario.

Use these instead of ad-hoc game work. Each file holds the full instructions.

- [`/add-game`](.claude/skills/add-game/) — designs a spec for a new/ported game (engine, registry, Supabase row, cover CSS).
- [`/add-game-impl`](.claude/skills/add-game-impl/) — implements an approved `/add-game` spec.
- [`/spec-impl-game <NN>`](.claude/skills/spec-impl-game/) — end-to-end impl of an approved game spec (reuses user-level `/spec-impl`), then runs `@skin-designer` → `@mobile-porter` **sequentially, never in parallel**.
- [`/game-jam <tema>`](.claude/skills/game-jam/) — picks 3 games for a theme and launches one `@game-jam` per game in parallel → `specs/game-jam/<NN>-<game-id>/spec.md` (Borrador). To implement: promote to `specs/NN-<slug>-vX.Y.Z.md`, mark `Aprobado`, run `/add-game-impl NN`.
- [`@game-planner`](.claude/agents/game-planner.md) — decides whether a candidate game fits or proposes the next one (upstream of `/add-game`); log in [`references/candidatos-juegos.md`](references/candidatos-juegos.md). No code.
- [`@game-jam`](.claude/agents/game-jam.md) — writes one jam spec. Launched only by `/game-jam`.
- [`@skin-designer <id>`](.claude/agents/skin-designer.md) — ensures `clasico`/`neon`/`retro` skins exist. Visual only.
- [`@mobile-porter <id>`](.claude/agents/mobile-porter.md) — makes a game playable on phones per spec 12 (input audit, `touchControls`, Playwright touch check).
- [`@game-performance-booster <id|nombre>`](.claude/agents/game-performance-booster.md) — measures and fixes an engine's performance per spec 14; reports before→after. **Uses git** (`git stash`, `git checkout -- <motor>` to revert a failed fix) — commit engine work before running it.

None of the agents bump versions or commit. `.claude/` is gitignored (since 2026-09-20), but the items above and `hooks/format-on-write.ps1` are force-added (`git add -f`) and tracked — force-add any new one too.

## Stack

- Next.js 16.2.10, App Router only (`app/`), React 19.2.4
- Tailwind CSS v4 via `@tailwindcss/postcss` — no `tailwind.config.*`; theme tokens via `@theme inline` in `app/globals.css`
- TypeScript, path alias `@/*` → repo root
- Fonts via `next/font/google` (Geist, Geist Mono) as CSS variables in `app/layout.tsx`

## Working with this Next.js version

Next.js 16.2.10 postdates this model's training data and has breaking changes. Before writing or editing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` (App Router: `01-app/`) and heed deprecation notices.

## Spec-driven workflow

Two systems share **one number/version sequence** — a new spec or change takes the next free `NN` across both `specs/` and `openspec/` (e.g. 11 exists only in `openspec/`) — and both bump `package.json` + `CHANGELOG.md`:

- **[`specs/`](specs/) (Klerith)** — `/spec` and `/spec-impl`, user-level skills from `Klerith/fernando-skills` (`npx skills@latest add Klerith/fernando-skills`). Files `specs/NN-slug-vX.Y.Z.md`; jam specs under `specs/game-jam/`.
- **[`openspec/`](openspec/) (OpenSpec)** — `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Changes are named like specs (e.g. `11-score-plausibility-caps-v0.2.5`), and so is their capability under `openspec/specs/<name>/spec.md`. Archive: `openspec/changes/archive/YYYY-MM-DD-<name>/`.
