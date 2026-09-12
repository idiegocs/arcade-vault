# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — a platform for playing games online and competing on points/leaderboards (per README, in Spanish). Built out via specs 01–06: real Supabase-backed auth, scores, and game catalog, plus one real playable game engine (`rocas`/Asteroids, spec 05) behind a pluggable engine contract (`components/games/game-engine.ts`) that the rest of the catalog can plug into. See `components/games/README.md` for how a new game is wired in.

## Skills

Usa siempre el /fontend-design para hacer interfaz de usuario.

This repo also ships two project-scoped skills under `.claude/skills/`: `add-game` (designs a spec for a new/ported game — motor, registry, Supabase row if needed, cover CSS if needed) and `add-game-impl` (implements an approved one). Use them instead of ad-hoc game additions.

## Stack

- Next.js 16.2.10, App Router only (`app/`), React 19.2.4
- Tailwind CSS v4 via `@tailwindcss/postcss` — there is no `tailwind.config.*`; theme tokens are declared with `@theme inline` directly in `app/globals.css`
- TypeScript with path alias `@/*` → repo root (`tsconfig.json`)
- Fonts loaded via `next/font/google` (Geist, Geist Mono), exposed as CSS variables and applied in `app/layout.tsx`

## Working with this Next.js version

Next.js 16.2.10 postdates this model's training data and has breaking changes vs. the Next.js you know from training — APIs, conventions, and file structure may differ. Before writing or editing any Next.js code (routing, data fetching, config, middleware, server/client component rules, etc.), read the relevant guide under `node_modules/next/dist/docs/` (App Router docs live under `01-app/`) instead of relying on prior knowledge, and heed any deprecation notices found there.

## Spec-driven workflow

The README documents an intended spec-driven design workflow using `/spec` and `/spec-impl`, based on the `Klerith/fernando-skills` skill pack (`npx skills@latest add Klerith/fernando-skills`). Those two are user-level skills (`~/.claude/skills/`), not installed in this repo's own `.claude/` — only the game-specific `add-game`/`add-game-impl` pair above is project-scoped and committed.
