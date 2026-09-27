# Cómo agregar un juego nuevo

**Usa `/add-game` (diseña el spec) + `/add-game-impl` (lo implementa)** —
esos dos skills (`.claude/skills/add-game/`, `.claude/skills/add-game-impl/`)
conocen los 4 artefactos de abajo, los gotchas del contrato de motor y el
orden en que hay que aplicarlos. Lo que sigue es la receta manual que
automatizan, para cuando necesites entender o revisar lo que hicieron.

1. Crea `components/games/<id>/` con un motor que exporte una función que
   cumpla `EngineFactory` (de `../game-engine`). El `<id>` es el mismo `id`
   ya definido en la tabla `games` de Supabase (`lib/games.ts`, `getGames()`)
   — no se inventa uno nuevo. **Si el juego todavía no tiene fila en
   `games`**, hay que crearla antes de poder guardar cualquier puntaje
   (`scores.game_id` tiene una FK a `games(id)`): una migración versionada en
   `sql/00N_add_game_<id>.sql` aplicada con el MCP de Supabase
   (`apply_migration`), igual que hicieron las specs 04/05/06. Esa fila
   también necesita una portada: `cover` es el nombre de una clase CSS
   (`.cover-<slug>`, no una imagen) que se agrega a la sección "Cover art
   generators" de `app/globals.css`, siguiendo el mismo patrón de gradientes
   que las 8 portadas existentes.
2. El motor dibuja sobre `ARENA_WIDTH × ARENA_HEIGHT`, llama a `onState(...)`
   solo cuando el valor mostrado realmente cambia (`score`, `lives`, `level`,
   `phase` o `badge` — no en cada frame de `requestAnimationFrame`), y su
   `destroy()` limpia todos sus propios listeners/timers/RAF (el shell no
   sabe nada de los internals del motor).
3. Si el juego tiene sonido, declara sus presets dentro del propio motor con
   `defineSounds` (de `./audio`), combinando `beep(...)` — `audio.ts` solo
   tiene la infraestructura compartida (contexto, mute, `beep`) y no se toca:

   ```ts
   const playSound = defineSounds({ jump: () => beep(660, 0.08, "square", 0.12) });
   ```

4. Agrega la entrada del juego en `components/games/registry.ts`, con el
   motor cargado por `import()` dinámico (no un import estático arriba del
   archivo) y su techo de puntuación plausible:

   ```ts
   <id>: {
     load: () => import("./<id>/<archivo-del-motor>").then((m) => m.create<Nombre>Engine),
     maxPlausibleScore: <techo>,
   },
   ```

   Así el motor de ese juego solo se descarga (su propio chunk de JS) cuando
   alguien entra a `/juegos/<id>/jugar` — visitar otros juegos no lo carga.
   `maxPlausibleScore` es el máximo que `saveScore` acepta en el servidor
   (exacto si el juego tiene un final enumerable, "techo de cordura" si es
   sin fin — ver spec `11-score-plausibility-caps-v0.2.5`); sin entrada en
   el registro, toda puntuación del juego se rechaza (fail closed).

Con eso, `/juegos/<id>/jugar` usa el motor real automáticamente —
`game-player-shell.tsx`, el HUD, la pausa, el modal de fin de partida y el
guardado de puntuación no se tocan.

## Skins

Todo motor debe soportar al menos 3 skins visuales. El agente
`skin-designer` las implementa juego por juego; **CAÍDA**
(`caida/tetris-engine.ts`) es la referencia que el resto imita.

| id        | Etiqueta | Qué es                                                                      |
| --------- | -------- | --------------------------------------------------------------------------- |
| `clasico` | CLÁSICO  | **Default.** El look original del motor, idéntico.                          |
| `neon`    | NEÓN     | Synthwave: tubos de neón huecos con glow, fondo violeta, grilla magenta.    |
| `retro`   | RETRO    | 4–6 tonos (Game Boy / CGA / NES), sin glow ni transparencias, bordes duros. |

### Contrato (plataforma)

- `game-engine.ts`: `REQUIRED_SKINS`, `SkinId`, `DEFAULT_SKIN` (`"clasico"`),
  `EngineOptions = { skin?: SkinId }`. `EngineFactory` recibe un 3er
  parámetro opcional `options?: EngineOptions` (un motor sin skins sigue
  compilando) y `EngineHandle` suma `setSkin?(skin)`, que cambia la skin en
  vivo sin reiniciar la partida.
- `skins.ts`: `getSavedSkin(gameId)` / `saveSkin(gameId, skin)` con
  `localStorage` bajo `av-skin:<gameId>` (valor inválido o ausente →
  `DEFAULT_SKIN`), y `SKIN_LABELS`.
- `registry.ts`: `skins?: readonly SkinId[]` en la entrada del juego. Sin
  `skins`, el reproductor no muestra selector.
- `game-player-shell.tsx`: selector en el HUD. Lee la skin guardada en el
  `useEffect` que crea el motor (nunca en el render — hidratación) y la pasa
  como `createEngine(canvas, onState, { skin })`; al cambiarla llama a
  `saveSkin` + `engine.setSkin?.(skin)`.

### Receta (por motor)

1. **Paleta tipada**: `type <Juego>Palette = { ... }` con todos los colores
   que el dibujo usaba como literal (fondo, grilla/bordes, cada entidad,
   texto del canvas, overlays). Los efectos que no son solo color (glow,
   contorno, marcas) van como datos en la paleta (`blockGlow: number`,
   `ghost: { kind: "outline" … }`), no como `if (skin === "neon")`.
2. **Tabla**: `const SKINS: Record<SkinId, <Juego>Palette>` con las 3.
   `clasico` copia los colores actuales tal cual.
3. **Estado**: `let palette = SKINS[options?.skin ?? DEFAULT_SKIN];` al crear
   el motor; el dibujo siempre lee de `palette`.
4. **`setSkin`** en el handle: reasigna `palette` y, si no hay frames
   corriendo (pausa), redibuja una vez.
5. **Registry**: `skins: ["clasico", "neon", "retro"]` en la entrada.

Reglas: las skins son **solo visuales** — nunca cambian hitboxes, tamaños,
velocidades, spawn, puntaje, controles ni sonidos. En NEÓN, resetear
`shadowBlur = 0` después de dibujar lo que brilla. En RETRO, si las
entidades comparten tono, distinguirlas por patrón o borde (CAÍDA usa
marcas interiores: punto, cuadro, franja, cruz).

**Nota para motores con controles de puntero:** el canvas se escala por CSS
a 100% de `.crt-screen`, pero su resolución interna sigue siendo fija
(`ARENA_WIDTH × ARENA_HEIGHT`). Un motor que use posición de mouse/touch
debe convertir las coordenadas del evento al espacio interno del canvas
(`canvas.getBoundingClientRect()` + escala), no usarlas tal cual.
