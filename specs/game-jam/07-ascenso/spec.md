# SPEC GAME-JAM — ASCENSO (volcán en erupción)

> **Estado:** Borrador
> **Tema:** volcán en erupción
> **Depende de:** 05-rocas-asteroids-motor, 06-ranking-global-catalogo-juegos-v0.2.0, 11-score-plausibility-caps-v0.2.5
> **Fecha:** 2026-11-02
> **Versión:** a asignar al promover (minor — package.json es la fuente de verdad; hoy `0.7.0 → 0.8.0`)
> **Objetivo:** Escribir desde cero el motor de ASCENSO, un trepador vertical de rebote automático en el que un explorador salta de repisa en repisa por la chimenea de un volcán mientras la lava sube, y sumarlo al catálogo como juego nuevo (fila en `games` + portada CSS propia).

## Alcance

**Incluye:**

- `components/games/ascenso/climb-engine.ts`: motor que exporta `createAscensoEngine: EngineFactory`, escrito desde cero (no hay fuente en `references/started-games/`), nativo 800×600, solo primitivas de canvas (sin assets binarios) y sonidos propios con `defineSounds` + `beep` (`audio.ts` no se modifica).
- `components/games/registry.ts`: entrada `ascenso: { load: () => import("./ascenso/climb-engine").then((m) => m.createAscensoEngine), maxPlausibleScore: 100_000, skins: ["clasico", "neon", "retro"], music: <pista de music-tracks.ts, a elegir al promover>, touchControls: {...} }` — techo de cordura (juego sin fin, cálculo en Modelo de datos).
- Skins `clasico` (default), `neon` y `retro` dentro del motor (patrón de CAÍDA, `components/games/README.md` § Skins). Solo visual.
- `touchControls` (spec 12): d-pad con `ArrowLeft`/`ArrowRight` (`repeat: true`), sin botones de acción; el puntero/dedo sobre el canvas también funciona (ver Controles).
- `sql/00N_add_game_ascenso.sql` (`N` = siguiente libre de `sql/` al promover; hoy `008`): `insert ... on conflict (id) do nothing` de la fila `ascenso` — idempotente, nunca `INSERT` a secas ni `DROP`/`UPDATE` de filas existentes. Aplicado vía MCP de Supabase (`apply_migration`).
- `app/globals.css`: bloque `.cover-ascenso` en "Cover art generators".
- `references/juegos-implementados.md`: fila nueva `ascenso` (regla de `CLAUDE.md`).
- `package.json` bump minor y entrada en `CHANGELOG.md` enlazando este spec.
- `references/security-checklist/politicas-rls.md`: **sin cambios** (la migración no toca políticas, funciones ni grants).

**Fuera de alcance:**

- Power-ups (jetpack, escudo), enemigos voladores, jefes, vidas extra.
- Acelerómetro / inclinación del dispositivo.
- Guardar récord de altura aparte del `score`.
- Audio con archivos; `devicePixelRatio`.
- Cambios a `game-player-shell.tsx`, `game-engine.ts`, `audio.ts` o `app/actions/scores.ts`.

## Modelo de datos

Sin tablas nuevas. Agrega **una fila** a `games` (caso C):

| Campo        | Valor |
| ------------ | ----- |
| `id`         | `ascenso` |
| `title`      | `ASCENSO` |
| `short`      | `Trepa la chimenea antes de que la lava te alcance.` |
| `long`       | `El volcán despertó y la lava sube sin pausa. Rebota de repisa en repisa, esquiva las que se desmoronan, aprovecha los géiseres y junta cristales de fuego. Cada metro cuenta: ¿hasta dónde llegas antes de que el magma te alcance?` |
| `cat`        | `ARCADE` |
| `cover`      | `cover-ascenso` |
| `color`      | `yellow` |
| `sort_order` | siguiente libre al promover |

**Tabla de puntuación (todos enteros, `score` nunca baja):**

| Evento | Puntos |
| ------ | ------ |
| Cada metro nuevo de altura máxima alcanzada (1 m = 50 px) | +1 |
| Cristal de fuego recogido | +25 |
| Hito de cada 100 m de altura máxima | +100 |
| Tocar la lava, caer o romper una repisa | 0 |

La altura puntúa solo por **récord de altura de la partida** (`maxHeight`): bajar y volver a subir no suma. Cada cristal suma una sola vez.

**Física (todo atado a `dt`, con `dt` topado a 1/30 s, nunca a FPS — el leaderboard no puede favorecer pantallas de 120 Hz):**

| Parámetro | Valor |
| --------- | ----- |
| Gravedad | 1.800 px/s² |
| Rebote normal (repisa) | `vy = −900` px/s → salto de 225 px |
| Rebote de géiser | `vy = −1.400` px/s → salto de ~544 px |
| Velocidad horizontal máx. | 340 px/s (aceleración 2.400 px/s², fricción al soltar 1.800 px/s²) |
| Pantalla envolvente | cruzar el borde izq./der. reaparece en el opuesto |
| Caída máxima | `vy` topada a +1.100 px/s |

El jugador solo rebota cuando **cae** (`vy > 0`) y sus pies cruzan la cara superior de una repisa (paso de arriba hacia abajo); sube atravesando repisas desde abajo.

**Repisas (generación procedural infinita, hacia arriba):**

| Tipo | Frecuencia | Comportamiento |
| ---- | ---------- | -------------- |
| Roca estable | base | Ancho 100 px, rebote normal. |
| Frágil | desde 100 m, ≤ 25 % | Se desmorona 0,15 s después del primer pisotón (rebota igual esa vez); luego desaparece. |
| Móvil | desde 250 m, ≤ 20 % | Se desliza horizontalmente ±80 px/s entre los muros. |
| Géiser | ≤ 1 cada 8 repisas | Rebote de géiser (`vy = −1.400`); aparece solo sobre repisas estables. |

Reglas de generación que garantizan que siempre hay camino (decidido por game-jam — revisar):

- Separación vertical entre repisas consecutivas: `gap = random(70, 70 + min(110, m × 0.2))` px donde `m` = metros del punto de generación. **Nunca > 180 px** (80 % del salto normal de 225 px).
- Al menos 1 de cada 3 repisas consecutivas es estable o de géiser (nunca 3 frágiles/móviles seguidas).
- Se generan 800 px por encima de la cámara y se descartan 100 px debajo de la lava.
- Los cristales aparecen 40 px sobre una repisa elegida al azar, máximo 1 cada 4 repisas.

**Lava:**

- Cota `lavaY` (sube = decrece `y`). Velocidad `lavaSpeed = min(110, 30 + 8 × (level − 1))` px/s desde el primer frame (con 2 s de gracia a 0 al empezar).
- Elástico: `lavaY` nunca queda más de 600 px por debajo de la altura máxima del jugador (la lava se acelera para mantener la presión si el jugador se aleja demasiado).
- Tocar la lava (los pies bajo `lavaY`) o caer bajo la cámara → pierde 1 vida.
- Cámara: sigue solo hacia arriba (`camY = min(camY, player.y − 300)`), nunca baja.

**Pérdida de vida y rescate:** −1 vida, suena `burn`, se baja `lavaY` 250 px (sin pasar bajo el borde inferior de la cámara), se coloca una **roca de rescate** estable bajo el jugador, 180 px sobre `lavaY`, y se lo relanza con rebote normal. Invulnerable 1,5 s (parpadea). Con 0 vidas → `gameover`.

**Mapeo a `EngineState`:**

| Campo | Valor |
| ----- | ----- |
| `score` | Acumulado según la tabla. Solo se resetea en `restart()`. |
| `lives` | Arranca en `3`. Resta 1 por contacto con la lava. Sin vidas extra. |
| `level` | `floor(maxHeightMeters / 100) + 1` — sube cada 100 m. |
| `badge` | `{ label: "ALTURA", value: "<m> m" }` — metros enteros de altura máxima; se llama `onState` solo cuando cambia el entero. |
| `phase` | `"paused"` si `isPaused`; `"gameover"` si `lives === 0` o tras `endGame()`; si no, `"playing"`. |

No hay victoria: la chimenea es infinita.

**Controles:**

| Input | Acción | `preventDefault` |
| ----- | ------ | ---------------- |
| `ArrowLeft` / `KeyA` | Acelerar a la izquierda | Solo flechas |
| `ArrowRight` / `KeyD` | Acelerar a la derecha | Solo flechas |
| Puntero (mouse/dedo) sostenido sobre el canvas | El jugador acelera hacia la X del puntero (no teletransporta: misma velocidad máx. 340 px/s) | Sí en `pointerdown` |
| `blur` de `window` | Suelta todo | — |

Sin tecla de pausa propia (la pausa es el botón del shell). Coordenadas de puntero escaladas con el patrón de `bloque-buster` (`getBoundingClientRect`).

**Sonido (`defineSounds` + `beep`, sin `setTimeout`):**

| Nombre | Dispara en | Preset sugerido |
| ------ | ---------- | --------------- |
| `bounce` | Rebote normal | `beep(520, 0.06, "square", 0.05)` |
| `geyser` | Rebote de géiser | `beep(440, 0.12, "sawtooth", 0.08)` + `beep(880, 0.18, "triangle", 0.06)` |
| `crumble` | Repisa frágil se rompe | `beep(140, 0.1, "sawtooth", 0.08)` |
| `crystal` | Cristal recogido | `beep(988, 0.08, "square", 0.06)` + `beep(1318, 0.1, "square", 0.05)` |
| `milestone` | Hito de 100 m | acorde `beep(523)`+`beep(659)`+`beep(784)`, 0.25 s, gain 0.06 |
| `burn` | Pérdida de vida | `beep(200, 0.25, "sawtooth", 0.15)` + `beep(100, 0.3, "square", 0.1)` |

**Render (sin assets ni `fillText`):** fondo de roca oscura con paralaje de 2 capas (siluetas de estalactitas cacheadas en canvas offscreen), repisas como rectángulos redondeados con borde incandescente, géiser como repisa con chorro naranja, cristales como rombos pulsantes, jugador como figura simple con casco y ojos, lava como ola sinusoidal (2 capas, `lavaY` + oscilación) con partículas de chispas (tope 60). Cumple "Rendimiento" de `components/games/README.md` (spec 14): fondo/paralaje cacheado, `draw` sin allocaciones por frame (pools para repisas/partículas), freeze del loop tras `gameover`. Skins: `clasico` (roca/lava naranja), `neon` (contornos cian/magenta sobre negro), `retro` (paleta de 4 tonos, sin glow).

**Techo de puntuación (`maxPlausibleScore = 100_000`, techo de cordura):**

La generación fija la densidad de repisas, así que la tasa de ascenso está acotada por la física:

- Repisas normales: ≤ 180 px de gap por rebote de ~1,0 s (`2 × 900 / 1.800`) → ≤ 180 px/s ≈ 3,6 m/s.
- Géiser (≤ 1 cada 8 repisas): 544 px en ~1,56 s; ciclo de 8 repisas ≈ (7 × 180 + 544) px en (7 × 1,0 + 1,56) s ≈ 210 px/s ≈ 4,2 m/s máx. sostenido.
- Puntos por metro: 1 (altura) + 1 por el hito (100/100 m) + cristales ≤ 25 por cada 4 repisas ≈ 25/(4×~125 px ≈ 10 m) = 2,5 → ≈ 4,5 pts/m.
- Tasa máxima ≈ 4,2 m/s × 4,5 ≈ 19 pts/s ≈ 68.000/h jugando perfecto y sin morir. `100_000` ≈ 1,5 h de partida perfecta con todos los cristales y todos los géiseres: inalcanzable en la práctica (realista 1.000–10.000).
- Si al implementar se cambian los parámetros de generación, recalcular este cap.

## Plan de implementación

1. Escribir `climb-engine.ts` con el esqueleto de `.claude/skills/add-game/motor-referencia.md`: constantes en la cabecera, estado en closure, `requestAnimationFrame` con `dt` topado, `onState` solo ante cambio de score/lives/level/phase/badge.
2. Generador de repisas con pool y reglas de la tabla; función pura `nextGap(m)` fácil de testear.
3. Colisión de rebote por cruce de cara superior (swept: comparar `y` anterior y actual de los pies) para no atravesar repisas a alta velocidad.
4. Lava, elástico, rescate e invulnerabilidad.
5. Skins y `setSkin`; fondos cacheados offscreen.
6. Registrar en `registry.ts` (con `maxPlausibleScore`, `skins`, `music`, `touchControls`), SQL, `.cover-ascenso`, `juegos-implementados.md`, bump de versión y `CHANGELOG.md`.
7. Después: `@skin-designer ascenso` → `@mobile-porter ascenso` (secuencial) y, si hace falta, `@game-performance-booster ascenso`.

## Criterios de aceptación

- [ ] `/juegos/ascenso/jugar` carga el motor real (no el mock) y la partida arranca en `playing` con 3 vidas, `level` 1 y badge `0 m`.
- [ ] El jugador rebota solo al caer sobre una repisa; subir desde abajo la atraviesa.
- [ ] Cruzar el borde lateral reaparece en el opuesto.
- [ ] La altura puntúa solo por récord (bajar y subir no suma); cristal +25 una vez; hito +100 cada 100 m; todo entero.
- [ ] Ningún hueco entre repisas consecutivas supera 180 px, y nunca hay 3 repisas frágiles/móviles seguidas (verificable con una simulación de 10.000 repisas generadas).
- [ ] Tocar la lava resta 1 vida, baja la lava, crea la roca de rescate y da 1,5 s de invulnerabilidad; con 0 vidas → `gameover`.
- [ ] Con puntero sostenido el jugador no se teletransporta: nunca supera 340 px/s horizontal.
- [ ] La física es independiente del FPS: misma altura de salto a 30, 60 y 144 Hz (verificable con Playwright).
- [ ] `saveScore` acepta un puntaje normal y rechaza uno > 100.000.
- [ ] Pausa congela física, lava y sonidos; tras `gameover` el loop se congela (spec 14).
- [ ] Las 3 skins funcionan en vivo sin alterar física ni puntaje.
- [ ] En móvil (spec 12) el d-pad ◀▶ y el toque en el canvas mueven al jugador.
- [ ] `destroy()` quita todos los listeners y cancela el `requestAnimationFrame`.

## Decisiones

- **Rebote automático, sin botón de salto** (decidido por game-jam — revisar): el único input es horizontal, lo que da buen fit táctil. Tipo "Doodle Jump", no lo cubre ningún motor ni candidato.
- **Puntaje por récord de altura, no por posición** (decidido por game-jam — revisar): evita farmear subiendo y bajando y hace el cap defendible.
- **Lava con elástico de 600 px y vidas con rescate** (decidido por game-jam — revisar): sin elástico, un jugador veloz se aleja y la lava deja de presionar; sin rescate, una sola caída termina en muerte injusta por un salto fallido.
- **Escala 1 m = 50 px** (decidido por game-jam — revisar): solo cosmética; los puntos son enteros y fijos.
- **Distinto de RANARIA/ROCAS/BLOQUE BUSTER:** no hay carriles ni tráfico (RANARIA), ni inercia con disparo (ROCAS), ni paleta con pelota (BLOQUE BUSTER); mecánica central = plataformas con rebote vertical y scroll hacia arriba.
- **Géiser como único power-up** (decidido por game-jam — revisar): se mantiene el cap acotado por física; sin jetpacks ni escudos.

## Riesgos

- **Física dependiente de dt:** el swept-collision de repisas debe usar la posición anterior; con `dt` topado a 1/30 s y `vy ≤ 1.400` el desplazamiento por frame (~47 px) sigue siendo menor al espaciado.
- **Spawner justo:** un bug en `nextGap` que permita gaps > 225 px haría el juego injugable; cubrir con el test de 10.000 repisas.
- **Cap:** si al implementar se agregan repisas más densas o más cristales, recalcular `maxPlausibleScore`.
- **Superposiciones:** ningún juego con motor ni candidato de `references/candidatos-juegos.md` repite el loop de trepar con rebote. Más cercanos en espíritu: ALETEO (física de un botón, vertical) y CARRETERA (scroll vertical); ambos difieren en input y objetivo.

## Lo que no está en este spec

- Power-ups adicionales, enemigos, jefes, vidas extra.
- Inclinación del dispositivo, multijugador, modo diario con semilla.
- Cualquier cambio a la plataforma genérica (shell, HUD, pausa, modal de fin, `saveScore`).
