# Tasks

## 1. Validation

- [x] 1.1 Add a `MAX_PLAUSIBLE_SCORE: Record<string, number>` constant in
      `app/actions/scores.ts` with `bloque-buster: 2080`, `rocas: 1_000_000`,
      `caida: 1_000_000`, `serpentina: 100_000` — verify `npm run lint`
      passes.
- [x] 1.2 In `saveScore`, before the Supabase insert, reject when
      `MAX_PLAUSIBLE_SCORE[gameId]` is undefined or `score` exceeds it,
      returning `{ ok: false, error: "Puntuación inválida." }` (same message
      already used for the non-integer/negative case) — verify by reading the
      updated function and confirming the insert is unreachable on both
      branches.

## 2. Manual verification (no test runner in this repo)

`saveScore` isn't reachable as a plain function from the browser console (it's
a Next.js Server Action, not a global) — verified instead via Playwright
against the real dev server + real Supabase project, using a temporary debug
route (`app/api/debug-save-score-temp/`, removed after) that called
`saveScore` directly and returned its result as JSON, hit with a real
authenticated session (a throwaway signup, `scorecap-test-20260920@example.com`,
no email confirmation required — see `specs/04-supabase-auth-scores.md`).
Each result cross-checked against the real `scores` table. Test user, its
profile, and its scores deleted afterward (`scores_left: 0, profile_left: 0`
confirmed); debug route deleted.

- [x] 2.1 Called `saveScore("bloque-buster", 2081)` — returned
      `{ ok: false, error: "Puntuación inválida." }`, no row inserted.
- [x] 2.2 Called `saveScore("bloque-buster", 2080)` and `saveScore("rocas",
  1000)` — both returned `{ ok: true }` and inserted normally (no
      regression for legitimate scores).
- [x] 2.3 Called `saveScore("gloton", 1)` (one of the 4 catalog games with no
      registered engine) — rejected (fail closed for unconfigured games).
- [x] 2.4 Played BLOQUE BUSTER through the real shell to a natural game over
      (lost all 3 lives; reaching a perfect 2080 clear isn't practical to
      automate) — the shell's normal save flow (`game-player-shell.tsx`'s
      auto-save on `phase: "gameover"`) still fired, the modal showed
      "PUNTUACIÓN GUARDADA" with score 70, and `scores` had a matching
      `bloque-buster` row at 70 — no regression.

## 3. Versioning

- [x] 3.1 Bump `version` in `package.json` to `0.2.5`.
- [x] 3.2 Add a `## [0.2.5]` entry to `CHANGELOG.md` following the existing
      format, linking to this change
      (`openspec/changes/11-score-plausibility-caps-v0.2.5`) and summarizing
      the server-side score cap under `### Added`.
