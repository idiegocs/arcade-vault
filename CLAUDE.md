# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — a platform for playing games online and competing on points/leaderboards (per README, in Spanish). Built out via specs 01–10: real Supabase-backed auth, scores, and game catalog, plus a growing set of real playable game engines behind a pluggable engine contract (`components/games/game-engine.ts`, registered in `components/games/registry.ts`) that the rest of the catalog plugs into gradually, one spec at a time. See `components/games/README.md` for how a new game is wired in. Any catalog entry without a registered engine falls back to a static, non-interactive mock HUD (`app/juegos/[id]/jugar/page.tsx`) left over from spec 01.

**`references/juegos-implementados.md` tracks which catalog games have a real engine.** Update it every time a game is added to or removed from `components/games/registry.ts` (or from the `games` table) — it's the source of truth for "which games exist and which have a real motor," kept separate from this file so this file doesn't go stale as the catalog grows.

`app/actions/scores.ts` (`saveScore`) rejects any score above the game's `maxPlausibleScore` before persisting (added by OpenSpec change `11-score-plausibility-caps-v0.2.5`). That cap lives in the game's own entry in `components/games/registry.ts`, next to its engine loader — a game with no registry entry gets every score rejected (fail-closed for unconfigured games is intentional). Game sounds likewise live in each engine (`defineSounds` from `components/games/audio.ts`, which only holds the shared infrastructure), so adding a game touches neither `audio.ts` nor `scores.ts`.

## Knowledge graph (Graphify)

`graphify-out/` holds a Graphify knowledge graph of the whole repo (code via AST + specs/docs via semantic extraction): `GRAPH_REPORT.md` (god nodes, communities, surprising connections), `graph.json` (full graph), `graph.html` (interactive view). **Use it before reading files one by one** when you need to understand the code — architecture, what calls what, how a spec maps to its implementation, or what a change would affect:

- `graphify-out/` is gitignored (generated, machine-specific), so a fresh clone won't have it. If it's missing, build it: `graphify extract . --code-only` then `graphify cluster-only . --no-label` (code only, local, no LLM), or `/graphify .` for the full graph including specs/docs (uses LLM tokens). Needs the `graphify` CLI (`pipx install "graphifyy[sql]"`).
- Start from `graphify-out/GRAPH_REPORT.md` for the big picture.
- Query instead of grepping around: `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify affected "X"` (or the `/graphify` skill, which answers from the existing graph).
- The graph can be stale — its report records the commit it was built from. After code changes, refresh with `graphify update .` (code only, no LLM); re-run `/graphify .` when specs/docs change. Always confirm against the actual source before editing.

## Skills

Usa siempre el /fontend-design para hacer interfaz de usuario.

This repo also ships two project-scoped skills under `.claude/skills/`: `add-game` (designs a spec for a new/ported game — motor, registry, Supabase row if needed, cover CSS if needed) and `add-game-impl` (implements an approved one). Use them instead of ad-hoc game additions.

**`.claude/agents/game-planner.md`** (`@game-planner`) decides whether a candidate game fits the platform (engine contract, bounded vs. sanity-ceiling scoring, catalog priority) or proposes the next one — a step upstream of `/add-game`, which assumes the game choice is already made. It never writes specs or code. See `references/candidatos-juegos.md` for its memory log of past evaluations, which it reads before every run and appends to after.

**`/game-jam <tema>`** (`.claude/skills/game-jam/`) runs a themed game jam: it picks 3 mechanically distinct games for the theme, then launches one **`@game-jam`** agent (`.claude/agents/game-jam.md`) per game **in parallel**, each writing a full `/add-game`-style spec (modeled on the existing game specs in `specs/`) to `specs/game-jam/<NN>-<game-id>/spec.md` — `NN` is a sequential number across all jams (next free one), the spec itself stays `Borrador` and unnumbered in the `specs/` sequence. Neither writes code; invoke the skill, not the agent directly. To implement one, promote it by hand to `specs/NN-<slug>-vX.Y.Z.md`, mark it `Aprobado`, then run `/add-game-impl NN`.

**`.claude/agents/skin-designer.md`** (`@skin-designer <game-id>`) checks that a game's engine has at least the `clasico` (default), `neon` and `retro` skins and implements any missing ones, using CAÍDA (Tetris) as the reference pattern. Skins are visual only — never gameplay, sounds or scoring. On its first run it also creates the skin infrastructure (`REQUIRED_SKINS`/`SkinId` in `game-engine.ts`, `components/games/skins.ts`, `skins` in `registry.ts`, and the selector in `game-player-shell.tsx`), applying it to `caida` first. It doesn't bump versions or touch git.

`.claude/` is gitignored as of 2026-09-20 (OpenSpec's own generated skills/commands live there and don't need to be committed) — but `add-game`, `add-game-impl`, `game-jam`, `hooks/format-on-write.ps1`, `agents/game-planner.md`, `agents/game-jam.md`, and `agents/skin-designer.md` were force-added (`git add -f`) and stay tracked; gitignore doesn't untrack existing files.

## Stack

- Next.js 16.2.10, App Router only (`app/`), React 19.2.4
- Tailwind CSS v4 via `@tailwindcss/postcss` — there is no `tailwind.config.*`; theme tokens are declared with `@theme inline` directly in `app/globals.css`
- TypeScript with path alias `@/*` → repo root (`tsconfig.json`)
- Fonts loaded via `next/font/google` (Geist, Geist Mono), exposed as CSS variables and applied in `app/layout.tsx`

## Working with this Next.js version

Next.js 16.2.10 postdates this model's training data and has breaking changes vs. the Next.js you know from training — APIs, conventions, and file structure may differ. Before writing or editing any Next.js code (routing, data fetching, config, middleware, server/client component rules, etc.), read the relevant guide under `node_modules/next/dist/docs/` (App Router docs live under `01-app/`) instead of relying on prior knowledge, and heed any deprecation notices found there.

## Spec-driven workflow

This repo runs **two** spec-driven systems side by side:

- **`specs/` (Klerith)** — the original one. The README documents `/spec` and `/spec-impl`, based on the `Klerith/fernando-skills` skill pack (`npx skills@latest add Klerith/fernando-skills`). Those two are user-level skills (`~/.claude/skills/`), not installed in this repo's own `.claude/`. Numbered files: `specs/NN-slug-vX.Y.Z.md` (01 through 10 so far), one per shipped version, indexed in `CHANGELOG.md`.
- **`openspec/` (OpenSpec)** — added 2026-09-20 (`openspec init`), used via `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. **Convention for this repo:** an OpenSpec change keeps numbering/dating/versioning itself the same way as `specs/`, continuing the same number sequence — e.g. change `11-score-plausibility-caps-v0.2.5` (specs/ left off at `10-...-v0.2.4`). Its main capability spec under `openspec/specs/<name>/spec.md` also gets named after the originating change (not a generic domain name like `score-integrity`) so the capability and the change/version that introduced it are traceable at a glance. Archived changes land in `openspec/changes/archive/YYYY-MM-DD-<name>/`. Both systems' version bumps go through the same `package.json` + `CHANGELOG.md` convention (see `CHANGELOG.md`'s header).

Only the game-specific `add-game`/`add-game-impl` pair, the `game-planner`, `game-jam` and `skin-designer` agents (above), and OpenSpec's own generated skills are project-scoped under `.claude/`.
