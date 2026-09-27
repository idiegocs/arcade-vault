# Candidatos de juegos evaluados

Bitácora de `@game-planner` (`.claude/agents/game-planner.md`) — funciona como su
memoria: **leer esta tabla completa antes de decidir** (para no repetir análisis
ni contradecir un veredicto anterior) y **agregar una fila al final** después de
cada evaluación o propuesta.

| Fecha | Candidato | Origen | Veredicto | Cap de score sugerido | Próximo paso | Motivo |
| ---------- | --------- | ------ | --------- | ---------------------- | ------------- | ------ |
| 2026-09-20 | INVASORES (Space Invaders) | game-planner | Encaja | acotado (~5.000–8.000; ej. filas × columnas × puntos por fila × oleadas, exacto a fijar en el spec) | `/add-game invasores` | Ya tiene fila en `games` y cover CSS (sin migración); mecánica de disparo/colisión análoga a ROCAS (ya implementado); sin IA compleja ni multiplayer; opción más barata y de menor riesgo entre las 4 filas del catálogo sin motor — **propuesta #1**. |
| 2026-09-20 | GLOTÓN (Pac-Man) | game-planner | Encaja | acotado (~N; pellets×puntos + power pellets + combos de fantasmas, por niveles fijos, exacto a fijar en el spec) | pendiente (después de INVASORES) | Ya tiene fila en `games` y cover; motor de laberinto + IA simple de persecución de fantasmas — algo más de esfuerzo que INVASORES por el pathfinding, pero factible en un spec. Propuesta #2. |
| 2026-09-20 | RANARIA (Frogger) | game-planner | Encaja | acotado (~N; cruces×puntos×niveles con techo de cordura en carriles infinitos, exacto a fijar en el spec) | pendiente (después de GLOTÓN) | Ya tiene fila en `games` y cover; movimiento por carriles + mecánica de flotar en troncos (colisión condicional agua/tronco) es mecánica nueva respecto a los motores existentes, sin multiplayer ni assets exóticos. Propuesta #3. |
| 2026-09-20 | DUELO PIXEL (versus) | game-planner | Con reservas | a definir | pendiente — aclarar mecánica antes de evaluar en profundidad | Categoría VERSUS sugiere 2 jugadores; si implica multiplayer en tiempo real no encaja con el contrato de motor (sin estado compartido remoto); si es local en un mismo dispositivo con inputs compartidos podría encajar, pero falta info del diseño original para confirmar. No recomendado como próximo paso hasta aclarar esto. |
| 2026-09-27 | INVASORES (Space Invaders) | game-planner | Encaja | acotado (~5.000–8.000; filas × columnas × puntos por fila × oleadas, exacto a fijar en el spec) | `/add-game invasores` | Reafirmación: `registry.ts` sigue sin `invasores`/`gloton`/`ranaria`/`duelo-pixel` y `references/juegos-implementados.md` no cambió desde la evaluación del 2026-09-20 — sigue siendo la fila de catálogo sin motor más barata (fila y cover ya existen, sin migración) y la propuesta #1 se mantiene sin cambios. |
