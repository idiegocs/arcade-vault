---
name: game-jam
description: Game jam temática para Arcade Vault — recibe un tema, elige 3 juegos mecánicamente distintos que encajen con el contrato de motor, y lanza un agente @game-jam por juego EN PARALELO para que cada uno escriba su spec completa en specs/game-jam/<NN>-<game-id>/spec.md. No escribe código.
disable-model-invocation: true
argument-hint: "<tema>"
---

# /game-jam — Orquestador de la game jam

## Contexto de sesión

Jams anteriores:
!`ls specs/game-jam/ 2>/dev/null || echo "specs/game-jam/ no existe"`

Juegos con motor real hoy:
!`cat references/juegos-implementados.md 2>/dev/null`

---

## Filosofía

La jam se parte en dos pasos:

1. **Elegir los juegos (acá, secuencial y corto).** Los 3 juegos tienen que ser mecánicamente distintos entre sí, y eso solo se puede garantizar viéndolos juntos.
2. **Escribir las specs (en paralelo).** Una vez asignados, cada juego es independiente: se lanza un agente `@game-jam` por juego, los 3 en el mismo mensaje.

Este skill no escribe specs ni código: elige, reparte y resume. Respondé en el idioma del prompt (en este repo, español).

## Fase 0 — Tema

El tema es `$ARGUMENTS`. Si viene vacío, preguntá el tema y pará ahí.

## Fase 1 — Contexto (liviano)

Solo lo necesario para elegir, no para especificar (eso lo hace cada agente):

1. `references/juegos-implementados.md` (arriba) — qué hay en el catálogo y qué tiene motor.
2. `references/candidatos-juegos.md` — qué ya se evaluó o descartó; no propongas algo que el usuario ya rechazó ahí, y evitá elegir un juego que sea básicamente un candidato ya evaluado con otro nombre (ej. un Pipe Mania temático cuando CAÑERÍA ya está en la bitácora). Si igual lo elegís, pasale al agente el nombre del candidato que se le parece.
3. `.claude/agents/game-planner.md`, sección "Criterios de decisión" — los criterios para filtrar ideas.
4. Catálogo en vivo con `mcp__supabase__execute_sql`: `select id, title, cat, cover, color, sort_order from games order by sort_order;`. Si el MCP no responde, caé a `sql/004_recreate_games_table.sql` más cualquier `sql/00N_add_game_*.sql` posterior, y avisalo.

## Fase 2 — Elegir los 3 juegos

1. Generá ~5 ideas inspiradas en el tema y filtralas con los criterios de `game-planner` (contrato de motor, scoring acotado o con techo de cordura, sesión corta competitiva, sin multiplayer en tiempo real, un motor por spec, sin assets binarios).
2. Quedate con **3 mecánicamente distintas entre sí** (no tres variantes del mismo loop) y distintas de los juegos que ya tienen motor. Preferí variar la categoría (`ARCADE | PUZZLE | SHOOTER | VERSUS`) y el color (`cyan | magenta | yellow | green`).
3. Para cada uno fijá:
   - `game-id`: slug kebab-case en minúsculas, en español como el resto del catálogo. No puede chocar con un `id` de `games` ni con el `game-id` de ninguna carpeta de `specs/game-jam/` (ignorando el prefijo numérico).
   - `NN`: número de carpeta, correlativo entre **todas** las jams. Tomá el mayor prefijo numérico de las carpetas de `specs/game-jam/` (arriba) y asigná los 3 siguientes, con 2 dígitos (`04`, `05`, `06`…; si no hay ninguna, empezá en `01`). La carpeta es `specs/game-jam/<NN>-<game-id>/`. El número solo ordena la carpeta: el `game-id` (y por lo tanto el `id` de `games`) nunca lleva el prefijo.
   - Título (mayúsculas, con acentos).
   - Caso: **C** (juego nuevo) o **B** (reskin temático de una fila del catálogo sin motor; el `game-id` es entonces el `id` existente).
   - Concepto: mecánica central en 1–3 frases, cat y color sugeridos.
4. Mostrá la tabla de los 3 juegos elegidos al usuario (sin esperar confirmación — la jam es autónoma).

## Fase 3 — Lanzar los agentes en paralelo

En **un solo mensaje**, lanzá **3 llamadas** a la herramienta `Agent` con `subagent_type: "game-jam"`, una por juego, para que corran en paralelo. Cada una con:

- `description`: `game-jam <game-id>`.
- `prompt` con: fecha de hoy, tema, `NN`, `game-id`, la ruta exacta `specs/game-jam/<NN>-<game-id>/spec.md`, título, caso, concepto, cat y color sugeridos, y la lista de los **otros dos** juegos de la jam (id + mecánica en una línea) para que no se pisen.

No escribas las specs vos, y no lances los agentes de a uno.

## Fase 4 — Resumen

Cuando los 3 agentes terminen, juntá sus filas en una sola tabla:

| game-id | Título | Mecánica (una línea) | Cat | Caso | `maxPlausibleScore` | Ruta |
| ------- | ------ | -------------------- | --- | ---- | ------------------- | ---- |

más las decisiones discutibles que marcó cada agente. Si alguno falló o reportó una incompatibilidad con el contrato de motor, decilo.

## Fase 5 — Registrar en la bitácora

Agregá al final de la tabla de `references/candidatos-juegos.md` **una fila por cada spec escrita** (las escribís vos, no los agentes — tres agentes editando el mismo archivo en paralelo se pisarían), con las mismas columnas que usa `@game-planner`:

| Fecha | Candidato | Origen | Veredicto | Cap de score sugerido | Próximo paso | Motivo |
| ----- | --------- | ------ | --------- | --------------------- | ------------ | ------ |
| YYYY-MM-DD | \<TÍTULO\> (\<mecánica corta\>, jam \<tema\>) | game-jam (jam \<tema\>) | Encaja / Con reservas | acotado (exacto N; cálculo) / techo de cordura (~N; cálculo) | spec en Borrador: `specs/game-jam/<NN>-<game-id>/spec.md` — promover a `specs/NN-...` y `/add-game-impl` | mecánica en una línea; caso; superposiciones con candidatos o juegos implementados que reportó el agente |

Si un agente falló y no escribió su spec, no agregues su fila. No toques `references/juegos-implementados.md`: ahí solo entran juegos con motor real, y eso pasa al implementar.

## Fase 6 — Próximo paso

Próximo paso, siempre humano:

1. Revisar las 3 specs y elegir cuál(es) implementar.
2. Promoverla: moverla a `specs/NN-<slug>-vX.Y.Z.md` (siguiente número libre de `specs/`), completar número y versión en el encabezado, y pasar el estado a `Aprobado` a mano.
3. Correr `/add-game-impl NN` (solo busca specs en `specs/` raíz, por eso la promoción es manual).

**Parar ahí.** No tocar git, no implementar.

## Reglas duras

- Este skill no escribe specs: las escriben los agentes `@game-jam`. El único archivo que edita es `references/candidatos-juegos.md` (Fase 5), y solo agregando filas al final.
- Siempre exactamente 3 juegos y 3 agentes, lanzados en paralelo.
- Nunca marcar specs como `Aprobado`, nunca correr `/add-game-impl`, nunca tocar git.
