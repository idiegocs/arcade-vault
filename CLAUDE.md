# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — a platform for playing games online and competing on points/leaderboards (per README, in Spanish). Currently just the unmodified `create-next-app` scaffold: no game features, routes, or components beyond the default `app/page.tsx` exist yet.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — ESLint (flat config: `eslint-config-next` core-web-vitals + typescript configs). Note the script is plain `eslint`, not `next lint`.

No test runner is configured in this repo yet.

## Stack

- Next.js 16.2.10, App Router only (`app/`), React 19.2.4
- Tailwind CSS v4 via `@tailwindcss/postcss` — there is no `tailwind.config.*`; theme tokens are declared with `@theme inline` directly in `app/globals.css`
- TypeScript with path alias `@/*` → repo root (`tsconfig.json`)
- Fonts loaded via `next/font/google` (Geist, Geist Mono), exposed as CSS variables and applied in `app/layout.tsx`

## Working with this Next.js version

Next.js 16.2.10 postdates this model's training data and has breaking changes vs. the Next.js you know from training — APIs, conventions, and file structure may differ. Before writing or editing any Next.js code (routing, data fetching, config, middleware, server/client component rules, etc.), read the relevant guide under `node_modules/next/dist/docs/` (App Router docs live under `01-app/`) instead of relying on prior knowledge, and heed any deprecation notices found there.

## Spec-driven workflow

The README documents an intended spec-driven design workflow using `/spec` and `/spec-impl`, based on the `Klerith/fernando-skills` skill pack (`npx skills@latest add Klerith/fernando-skills`). These skills are not currently installed in this repo (no `.claude/` skills directory present).
