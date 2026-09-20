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

- [ ] 2.1 Via the dev server, log in and call `saveScore("bloque-buster",
  2081)` from the browser console on `/juegos/bloque-buster/jugar` —
      verify it returns `{ ok: false, ... }` and no row appears in `scores`.
- [ ] 2.2 Call `saveScore("bloque-buster", 2080)` and `saveScore("rocas",
  1000)` — verify both return `{ ok: true }` and insert normally (no
      regression for legitimate scores).
- [ ] 2.3 Call `saveScore("<engine-less game id>", 1)` for one of the 4
      catalog games with no registered engine — verify it's rejected (fail
      closed for unconfigured games).
- [ ] 2.4 Play a full BLOQUE BUSTER game to completion (win, all 5 levels) —
      verify the shell's normal save flow still succeeds and the score
      displayed matches what's persisted.

## 3. Versioning

- [ ] 3.1 Bump `version` in `package.json` to `0.2.5`.
- [ ] 3.2 Add a `## [0.2.5]` entry to `CHANGELOG.md` following the existing
      format, linking to this change
      (`openspec/changes/11-score-plausibility-caps-v0.2.5`) and summarizing
      the server-side score cap under `### Added`.
