# Juegos implementados

Estado del catálogo (tabla `games` en Supabase) frente a los motores reales
registrados en `components/games/registry.ts`. **Actualizar este archivo
cada vez que se agregue o elimine un juego** — ver la regla en `CLAUDE.md`.

| id             | Título       | Categoría | Motor                                                              | Spec |
| -------------- | ------------ | --------- | ------------------------------------------------------------------- | ---- |
| `rocas`        | ROCAS        | SHOOTER   | ✅ Asteroids — `components/games/rocas/asteroids-engine.ts`         | 05   |
| `caida`        | CAÍDA        | PUZZLE    | ✅ Tetris — `components/games/caida/tetris-engine.ts`                | 07   |
| `bloque-buster`| BLOQUE BUSTER| ARCADE    | ✅ Arkanoid — `components/games/bloque-buster/arkanoid-engine.ts`   | 09   |
| `serpentina`   | SERPENTINA   | ARCADE    | ✅ Snake — `components/games/serpentina/snake-engine.ts`             | 10   |
| `gloton`       | GLOTÓN       | ARCADE    | ❌ sin motor — mock estático (`app/juegos/[id]/jugar/page.tsx`)      | —    |
| `invasores`    | INVASORES    | SHOOTER   | ❌ sin motor — mock estático                                        | —    |
| `ranaria`      | RANARIA      | ARCADE    | ❌ sin motor — mock estático                                        | —    |
| `duelo-pixel`  | DUELO PIXEL  | VERSUS    | ❌ sin motor — mock estático                                        | —    |

Un juego con motor real también necesita una entrada en
`MAX_PLAUSIBLE_SCORE` (`app/actions/scores.ts`) — sin eso, `saveScore`
rechaza cualquier puntuación suya (fail-closed intencional, ver spec
`11-score-plausibility-caps-v0.2.5`).
