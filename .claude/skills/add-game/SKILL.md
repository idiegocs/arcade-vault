---
name: add-game
description: Diseña el spec de un juego nuevo para Arcade Vault — portado de references/started-games/ o escrito desde cero. Clasifica qué artefactos hacen falta (motor, fila en Supabase, cover CSS), pregunta la mecánica hasta que el motor quede completamente especificado, y escribe el spec en specs/. No escribe código.
disable-model-invocation: true
argument-hint: "<slug del catálogo> | <descripción del juego nuevo>"
---

# /add-game — Diseñador de specs de juego

## Contexto de sesión

Specs existentes:
!`ls specs/ 2>/dev/null || echo "specs/ no existe"`

Juegos con motor real hoy:
!`cat components/games/registry.ts 2>/dev/null`

Fuentes de referencia disponibles para portar:
!`ls references/started-games/ 2>/dev/null || echo "references/started-games/ no existe"`

Motores ya implementados:
!`ls components/games/ 2>/dev/null`

Branch actual:
!`git branch --show-current`

---

## Filosofía

Este skill es una especialización de `/spec` para un tipo de feature muy
concreto: agregar un juego jugable con su leaderboard. Existe porque el
conocimiento de cómo hacerlo bien vive repartido entre
`specs/05-rocas-asteroids-motor.md`, `specs/06-ranking-global-catalogo-juegos-v0.2.0.md`,
`components/games/README.md` y las 599 líneas de
`components/games/rocas/asteroids-engine.ts` — y ese README documenta 3 de
los 4 artefactos que realmente hacen falta (nunca menciona que hace falta
una fila en la tabla `games`).

**Este skill no escribe código.** Termina en un spec en `specs/`, en estado
`Borrador`, listo para `/add-game-impl` una vez que el humano lo revise y lo
pase a `Aprobado` — exactamente el mismo gate que ya usa `/spec-impl`.

Tus respuestas van en el idioma del prompt inicial (igual que `/spec`) — en
este repo, español.

## Fase 1 — Contexto

Antes de preguntar nada sobre el juego:

1. Leer `CLAUDE.md` y `AGENTS.md` — recuerdan que Next.js 16.2.10 postdata tu
   entrenamiento; si en algún momento tocás rutas, `params`, o convenciones
   del App Router, leé `node_modules/next/dist/docs/01-app/` antes de asumir
   nada.
2. Leer `components/games/README.md`, `components/games/game-engine.ts` y
   `components/games/registry.ts` — el contrato real, no una paráfrasis.
3. Leer `.claude/skills/add-game/motor-referencia.md` (en esta misma
   carpeta) — el esqueleto canónico y los gotchas del motor de `rocas`.
4. Leer los dos specs más recientes de `specs/` para el tono y las
   convenciones vigentes (probablemente 05 y 06, o los que hayan salido de
   este mismo skill después).
5. Leer `package.json` para la versión actual — el spec de un juego nuevo
   siempre incluye un bump de versión (ver `plantilla-spec.md`).

Consultar el catálogo **en vivo**, no el archivo SQL (que puede haber
quedado atrás de la base real):

```sql
select id, title, cat, cover, color, sort_order from games order by sort_order;
```

vía el MCP de Supabase (`mcp__supabase__execute_sql`). Si el MCP no responde
o no está disponible, caer a `sql/004_recreate_games_table.sql` (más
cualquier `sql/00N_add_game_*.sql` posterior) y decirle al usuario que estás
trabajando con el archivo, no con la base real, por si difieren.

## Fase 2 — Clasificar el juego

El argumento (`$ARGUMENTS`) es un slug del catálogo (`caida`, `bloque-buster`,
...) o una descripción libre de un juego nuevo. Determinar en cuál de los
tres casos cae, **mostrárselo al usuario y esperar su confirmación** antes de
pasar a las preguntas de mecánica — de esto depende toda la lista de
artefactos:

| Caso                                   | Situación                                                                                    | Artefactos que van al spec                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A — Port**                           | Tiene fila en `games` **y** hay una fuente en `references/started-games/` que le corresponde | motor + línea en `registry.ts`                                                                                           |
| **B — Desde cero, catálogo existente** | Tiene fila en `games`, sin fuente de referencia                                              | motor + línea en `registry.ts`                                                                                           |
| **C — Juego nuevo**                    | No existe fila en `games` para ese slug                                                      | motor + `registry.ts` + `sql/00N_add_game_<id>.sql` + (si el cover es nuevo) bloque `.cover-<slug>` en `app/globals.css` |

Mapeo de partida conocido (confirmalo contra el catálogo en vivo, no lo
asumas si pasó tiempo desde que se escribió este skill):

- Caso A: `caida` ↔ `references/started-games/03-tetris`; `bloque-buster` ↔
  `references/started-games/04-arkanoid`. (`02-asteroids` ya está portado a
  `rocas` — si te piden re-portarlo, avisá que ya existe.)
- Caso B: `serpentina`, `gloton`, `invasores`, `ranaria`, `duelo-pixel` — fila
  en el catálogo, sin fuente en `references/`.
- Caso C: cualquier slug fuera del catálogo actual. El `sort_order` de la
  fila nueva es el máximo actual + 1.

**Si el slug pedido ya tiene motor en `registry.ts`**, parar acá y decirlo —
no se duplica.

## Fase 3 — Preguntas de mecánica (bloques de 3 a 5)

Misma regla que `/spec`: preguntas concretas, nunca abiertas; cuando ofrezcas
opciones, 2 a 4, marcando tu recomendación y por qué. Esperar respuesta entre
bloques, no encadenar todo en un solo mensaje.

**Bloque 1 — Identidad y mecánica**

1. Objetivo del juego en una frase (qué hace ganar).
2. Qué evento suma puntos y cuánto (tiene que resultar en enteros — ver
   Bloque 2).
3. Condición de fin de partida.
4. ¿Hay vidas? ¿Cuántas al empezar?

**Bloque 2 — Puntuación y progresión**

1. Tabla de puntos por evento — todos enteros: `saveScore` rechaza scores no
   enteros o negativos con "Puntuación inválida.".
2. Cómo avanza `level` (¿hay niveles o es un solo nivel continuo?).
3. ¿Qué va en `badge` (el indicador extra opcional), si algo? Ej.: líneas
   completadas, combo, power-up activo. Si no aplica, `badge` se omite.

**Bloque 3 — Controles**

1. Teclas exactas (en términos de `KeyboardEvent.code`: `ArrowLeft`,
   `Space`, etc.), qué acción dispara cada una.
2. ¿Se usa mouse/touch? Si sí, para qué (mover un paddle, apuntar, etc.).
3. ¿Hace falta `preventDefault()` en flechas/espacio para que no scrolleen
   la página? (Recomendado: sí, si el juego usa esas teclas — el motor de
   `rocas` no lo hace y es un bug conocido, no lo repitas.)

**Bloque 4 — Resolución y assets**

1. Si es un port: ¿la fuente es nativamente 800×600? Si no (ej. Tetris a
   300×600), ¿se centra/letterboxea o se recalcula la escala? (Ver
   `motor-referencia.md` §4 para el caso ya resuelto de tetris/arkanoid.)
2. ¿Hay assets binarios (imágenes, audio)? Si sí, confirmar que van a
   `public/` con ruta absoluta, y que el audio se corta en `destroy()`.

**Bloque 5 — Solo caso C (juego nuevo, sin fila en `games`)**

1. `title` (mayúsculas, con acentos si corresponde — ej. "CAÍDA").
2. `short` (una línea para la card) y `long` (párrafo para el detalle).
3. `cat`: `ARCADE | PUZZLE | SHOOTER | VERSUS`.
4. `color`: `cyan | magenta | yellow | green`.
5. Nombre de la clase `.cover-<slug>` y qué debe dibujar (colores, formas,
   glyph) — se integra a la sección "Cover art generators" de
   `app/globals.css` reusando los tokens `var(--cyan|--magenta|--yellow|--green|--ink)`.

**Bloque 6 — Versión**

1. Confirmar el bump de `package.json` (recomendado: minor — es
   funcionalidad nueva visible para el usuario, no un fix ni un cambio
   interno).

**Casos especiales — preguntar explícitamente, no asumir:**

- Si el juego no tiene concepto de vidas (como Tetris): qué se reporta en
  `lives` del `EngineState` (¿un valor fijo? ¿se repropone el campo?).
- Si el juego tiene un estado de "victoria" sin equivalente en
  `EnginePhase` (como el `'win'` de Arkanoid): confirmar que se mapea a
  `"gameover"` (así igual dispara el guardado del score).

**Cuándo parar de preguntar:** cuando puedas responder, sin asumir nada: qué
archivos van a aparecer o cambiar, cuál es el primer y el último paso
ejecutable del plan, y cómo se verifica que el juego quedó funcionando.

## Fase 4 — Escribir el spec

Sección por sección, siguiendo `.claude/skills/add-game/plantilla-spec.md`
al pie de la letra (que a su vez sigue la forma de
`specs/06-ranking-global-catalogo-juegos-v0.2.0.md`). Mostrar cada sección
formateada en markdown y preguntar "¿Esta sección queda así o la ajustamos?"
antes de pasar a la siguiente — igual que `/spec`.

Orden: Encabezado → Alcance → Modelo de datos (con el Mermaid) → Plan de
implementación → Criterios de aceptación → Decisiones → Riesgos → cierre "Lo
que no está en este spec".

Al confirmar todas las secciones:

1. Determinar el número secuencial siguiente mirando `specs/`.
2. Generar un slug corto del objetivo (ej. `caida-tetris-motor`).
3. Nombre de archivo: `specs/NN-slug-vX.Y.Z.md` (el sufijo de versión, igual
   que hace `/spec` desde spec 06). Confirmar el nombre con el usuario antes
   de escribir.
4. Crear el archivo con `Estado: Borrador`. **No marcarlo `Aprobado`
   automáticamente.**
5. Confirmar al usuario:
   - Ruta del archivo creado.
   - Recordatorio: queda en Borrador, hay que releerlo y pasarlo a
     `Aprobado` a mano.
   - Próximo paso: `/add-game-impl NN-slug`.
   - **Parar ahí.** No proponer implementar, no escribir código, no tocar
     git.

## Reglas duras

- **Nunca escribir código en este skill.** Solo el `.md` del spec al final.
- **Nunca proponer tocar la plataforma genérica**: `components/games/game-player-shell.tsx`,
  `components/games/game-engine.ts`, `app/actions/scores.ts`, el HUD, la
  pausa ni el modal de fin de partida. Spec 05 garantiza que ningún juego
  nuevo los necesita. Si en algún momento el juego que estás especificando
  parece necesitar tocarlos, **parar y decirlo** — es señal de que el
  contrato se quedó corto, y eso merece su propio spec, no un parche de
  paso dentro de este.
- **El `<id>` del motor es el mismo `id` de `games`** (existente, o el que
  el caso C va a crear). Nunca inventar un id paralelo.
- **Nunca generar el spec completo en una sola respuesta** — sección por
  sección, con confirmación.
- **Nunca asumir decisiones que el usuario no confirmó** — si falta
  información, preguntar.

## Argumentos

- `/add-game caida` → arranca clasificando `caida` (caso A, ya tiene fuente
  de referencia en `03-tetris`).
- `/add-game "un pinball de neón"` → arranca clasificando como caso C (no
  hay fila en `games` para eso), y el Bloque 5 de preguntas se vuelve
  obligatorio.
- Sin argumento → preguntar qué juego se quiere agregar antes de todo.
