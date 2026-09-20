# Design

## Context

`saveScore` (`app/actions/scores.ts`) is the only path that writes to
`scores`. It already runs server-side, gets the user id from the server
session (never from the client), and enforces RLS (`auth.uid() = user_id`).
Its only current validation is `Number.isInteger(score) && score >= 0`. The
score value itself comes from the game engine's in-memory state
(`EngineState.score`, see `components/games/game-engine.ts`) and is passed
through `game-player-shell.tsx` untouched — there is no server-side
recomputation of gameplay. See `proposal.md` for why that's a problem.

The catalog (`games` table, `lib/games.ts`) has 8 entries; only 4 have a
registered engine in `components/games/registry.ts` (`rocas`, `caida`,
`bloque-buster`, `serpentina`). The other 4 have no scoring logic to ground a
cap in.

## Goals / Non-Goals

**Goals:**

- Reject scores that are provably impossible (`bloque-buster` above its exact
  max) or wildly implausible (the 3 endless games above a generous ceiling),
  server-side, before insert.
- Keep `saveScore`'s existing contract: same signature, same
  `SaveScoreResult` shape, same behavior for currently-valid submissions.
- Fail closed for any `game_id` without a configured maximum, so a future
  catalog entry or an engine-less game can't bypass validation by omission.

**Non-Goals:**

- Detecting moderate cheating in the 3 endless games (e.g. a plausible-looking
  but still-fabricated score). That needs play-duration tracking and/or
  server-issued run tokens per game session — a materially bigger change
  (new table, changes to `game-player-shell.tsx` and the engine contract),
  deliberately descoped in the explore/propose conversation that led to this
  change.
- Server-authoritative replay/recomputation of gameplay. Would require
  rewriting all 4 engines to be deterministic and replayable server-side;
  out of scope.
- Adding caps for the 4 engine-less catalog games. A cap needs scoring rules
  to ground it in; those games get a cap when their engine is built (see
  `components/games/README.md`'s existing recipe for adding a game).

## Decisions

**Where the caps live:** a single `Record<string, number>` constant
(`MAX_PLAUSIBLE_SCORE`, keyed by `game_id`) colocated in
`app/actions/scores.ts`, next to the function that uses it. Not a DB table or
a column on `games`: these values change only when a game's own scoring rules
change (rare, requires a code change to the engine anyway), so keeping them
as code next to their only reader is simpler than a migration for something
that isn't runtime-configurable data.

**BLOQUE BUSTER's exact cap (2080):** derived directly from
`components/games/bloque-buster/arkanoid-engine.ts` — 5 fixed levels
(`LEVELS`), 208 total blocks across them (60 + 40 + 30 + 39 + 39, counted
from each level's block layout), 10 points per block (`score += 10` on
destroy), no other score-increasing event in the file, and the engine ends
the game after level 5 with no loop (`internalPhase = "gameover"` when
`level === 5` and all blocks are cleared). A perfect single playthrough is
the only way to reach 2080; nothing scores higher.

**Endless games' sanity ceilings (rocas 1,000,000 / caida 1,000,000 /
serpentina 100,000):** chosen as round numbers comfortably above any
realistic single-session score given each game's per-event points (rocas:
100/50/20 per asteroid size; caida: `LINE_SCORES[cleared] * level` plus small
drop bonuses; serpentina: 10 per fruit), while staying far below an
obviously-fabricated value. These are tuning parameters, not derived
constants — see Open Questions.

**Fail-closed for unconfigured games:** `MAX_PLAUSIBLE_SCORE[gameId]` missing
is treated as "no valid score exists for this game" (reject), not "no limit."
This also naturally covers the 4 engine-less catalog entries without needing
a separate check.

**Error message:** reuse the existing `"Puntuación inválida."` message for a
rejected implausible score (same message already used for negative/non-integer
scores). Keeps `saveScore`'s error surface unchanged and doesn't hint at the
exact cap value to a would-be tester.

## Risks / Trade-offs

- **Ceilings for endless games don't stop determined cheating** — a score of
  900,000 for `rocas` still passes. Mitigation: explicitly scoped out (see
  Non-Goals); this change only removes the trivial "paste 999999999" attack.
- **BLOQUE BUSTER's cap breaks if the engine's levels change** — if a future
  change to `arkanoid-engine.ts` adds/removes blocks or levels, 2080 becomes
  wrong (too strict, rejecting legitimate perfect runs, or too loose). No
  automated link between the two files enforces this. Mitigation: the block
  count and its source are spelled out in this doc and should be re-derived
  by hand if that engine changes.
- **Sanity ceilings are guesses, not measured data** — there's no existing
  score history to validate against (this is the first score-integrity pass).
  Mitigation: see Open Questions.

## Open Questions

- Once the app has real score history for `rocas`, `caida`, and `serpentina`,
  the sanity ceilings should be revisited against actual top scores (are they
  generous enough not to clip legitimate marathon sessions? tight enough to
  still mean something?). This doesn't change the requirement, approach, or
  task breakdown here — just the three numeric constants, later, with data.
