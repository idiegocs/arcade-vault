# Cómo agregar un juego nuevo

1. Crea `components/games/<id>/` con un motor que exporte una función que
   cumpla `EngineFactory` (de `../game-engine`). El `<id>` es el mismo `id`
   ya definido en la tabla `games` de Supabase (`lib/games.ts`, `getGames()`)
   — no se inventa uno nuevo.
2. El motor dibuja sobre `ARENA_WIDTH × ARENA_HEIGHT`, llama a `onState(...)`
   solo cuando el valor mostrado realmente cambia (`score`, `lives`, `level`,
   `phase` o `badge` — no en cada frame de `requestAnimationFrame`), y su
   `destroy()` limpia todos sus propios listeners/timers/RAF (el shell no
   sabe nada de los internals del motor).
3. Agrega una línea en `components/games/registry.ts` usando `import()`
   dinámico, no un import estático arriba del archivo:

   ```ts
   <id>: () => import("./<id>/<archivo-del-motor>").then((m) => m.create<Nombre>Engine),
   ```

   Así el motor de ese juego solo se descarga (su propio chunk de JS) cuando
   alguien entra a `/juegos/<id>/jugar` — visitar otros juegos no lo carga.

Con eso, `/juegos/<id>/jugar` usa el motor real automáticamente —
`game-player-shell.tsx`, el HUD, la pausa, el modal de fin de partida y el
guardado de puntuación no se tocan.

**Nota para motores con controles de puntero:** el canvas se escala por CSS
a 100% de `.crt-screen`, pero su resolución interna sigue siendo fija
(`ARENA_WIDTH × ARENA_HEIGHT`). Un motor que use posición de mouse/touch
debe convertir las coordenadas del evento al espacio interno del canvas
(`canvas.getBoundingClientRect()` + escala), no usarlas tal cual.
