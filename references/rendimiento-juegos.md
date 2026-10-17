# Rendimiento de los juegos

Log de las corridas de `@game-performance-booster` (`.claude/agents/game-performance-booster.md`):
qué se midió, qué se corrigió en el motor y cuánto mejoró, juego por juego. El
contrato y el método son los del spec 14 (`specs/14-rendimiento-motores-v0.5.2.md`);
las reglas de dibujo, la sección "Rendimiento" de `components/games/README.md`.

Formato de cada celda: `FPS / peor frame ms / ms de trabajo del hilo principal por frame`
(headless, 30 s por skin, bot con las teclas reales del motor). Con GPU el FPS se
satura al tope del monitor (160 Hz) y sin GPU al tope de Chrome headless (60): el
número que discrimina es el de ms de trabajo por frame.

**Solo se agrega al final; las corridas anteriores no se tocan.**

---

## 2026-10-17 — `caida` (CAÍDA, Tetris)

- **Commit de partida:** `2d3e686` (tomado del estado de git al empezar; en esta corrida no se ejecutó git por pedido del llamador).
- **Motor:** `components/games/caida/tetris-engine.ts`. Skins: `clasico`, `neon`, `retro`.
- **Bot:** `ArrowLeft`, `ArrowRight`, `ArrowUp`, `KeyX`, `ArrowDown` y `Space` al azar cada 150 ms, más JUGAR DE NUEVO. Hubo 0–1 game over por corrida de 30 s (corridas válidas).

### Antes

| Skin    | Escritorio (GPU, 1x) | CPU 4x (GPU)       | Sin GPU, 1x      | Sin GPU + CPU 4x |
| ------- | -------------------- | ------------------ | ---------------- | ---------------- |
| clasico | 159,9 / 12,5 / 0,22  | 159,9 / 12,4 / 0,81 | 60 / 16,8 / 0,59 | 60 / 16,8 / 2,25 |
| neon    | 160 / 6,5 / 0,23     | 160 / 6,4 / 0,90   | 60 / 16,8 / 1,22 | 60 / 16,8 / 3,95 |
| retro   | 160 / 6,4 / 0,23     | 159,9 / 12,6 / 0,81 | 60 / 16,8 / 0,53 | 60 / 16,8 / 2,31 |

Game over: el canvas seguía dibujando detrás del modal (NEÓN: 2420 `fillRect` + 5082 `strokeRect` en 1,5 s).

### Después

| Skin    | Escritorio (GPU, 1x) | CPU 4x (GPU)        | Sin GPU, 1x      | Sin GPU + CPU 4x     |
| ------- | -------------------- | ------------------- | ---------------- | -------------------- |
| clasico | 159,9 / 18,8 / 0,13  | 159,9 / 12,5 / 0,45 | 60 / 16,8 / 0,26 | 60 / 16,8 / **1,03** |
| neon    | 160 / 6,9 / 0,12     | 159,9 / 12,5 / 0,42 | 60 / 16,8 / 0,27 | 60 / 16,8 / **1,04** |
| retro   | 160 / 6,4 / 0,14     | 159,9 / 12,5 / 0,38 | 60 / 16,8 / 0,27 | 60 / 16,8 / **1,01** |

Game over: 0 `drawImage`/`fillRect`/`strokeRect` en 1,5 s tras FIN, en las 3 skins.

Intermedias (sin GPU + CPU 4x, clasico / neon / retro): tras el `bgCache` 2,14 / 4,62 / 2,24; tras sprites + capa del tablero 2,55 / 2,50 / 2,44; tras el redibujo solo con cambios 1,08 / 0,96 / 1,05.

### Correcciones

1. **Freeze tras el game over** (regla 1): `loop` corta el rAF en `gameover`. Las guardas de `endGame`/`restart`/`setSkin` ya estaban.
2. **Helpers con el contexto como parámetro** (regla 4): `drawBlock(c, ox, oy, …)` en coordenadas locales de la celda; `drawBoardFrame(c)`, `drawNextFrame(c)`, `drawNextPiece(c)`. El resultado es idéntico al píxel.
3. **`bgCache`** (regla 2): fondo, tablero, grilla (28 `stroke()`), marco con glow, el texto "SIGUIENTE" y la caja de la vista previa.
4. **Glow en sprites** (regla 3): un sprite por tipo de pieza (normal y fantasma) con `pad = ceil(blockGlow × 1,5) + 2`, más una **capa del tablero** (`boardLayer` = `bgCache` + bloques fijos) que solo se repinta cuando cambia `board` (`merge`, topout, `initGame`). En NEÓN, el peor caso pasaba de ~200 `shadowBlur` por frame a 0.
5. **`invalidateCaches()`** (regla 6): la llaman `setSkin` (antes del redibujo) y `destroy`. `invalidateBoardLayer()` es la invalidación del tablero.
6. **Sin allocaciones por frame** (regla 5): `reportState()` ya no arma `EngineState` + `badge` + `String(lines)` en cada frame, solo cuando algo cambió.
7. **Redibujo solo con cambios** (flag `dirty`): el loop sigue corriendo `update` en cada frame, pero solo llama a `draw()` si cambió algo de lo que se ve (pieza, rotación, posición, próxima pieza, tablero o skin). No se tocaron ni el input ni el gameplay.

La regla 7 (un solo `clip`) no aplica: el motor no usa `clip`.

**Veredicto:** antes, escritorio ✅, celular holgado (≤ 3,95 ms) y game over sin congelar ❌. Después, escritorio ✅, celular holgado (1,0 ms, −54 a −74 %) y game over congelado ✅.

---

## 2026-10-17 — `rocas` (ROCAS, Asteroids)

- **Commit de partida:** `2d3e686` (tomado del estado de git al empezar; en esta corrida no se ejecutó git por pedido del llamador).
- **Motor:** `components/games/rocas/asteroids-engine.ts`. Skins: `clasico`, `neon`, `retro`.
- **Bot:** `ArrowLeft`, `ArrowRight`, `ArrowUp` (motor) y `Space` al azar cada 150 ms (pulsaciones de 80 ms), más un `Space` extra cada 220 ms, más JUGAR DE NUEVO. Juega de verdad (780 puntos en 10 s de prueba). Hubo 0 game overs por corrida de 30 s (corridas válidas).
- **Además del script S1:** un arnés determinista (`Math.random` con semilla + rAF virtual) para comparar el canvas al píxel antes y después en 27 estados (9 por skin, con disparos, impactos, power-up y partículas), y un benchmark determinista (la misma escena, 600 frames reales, 3 repeticiones) para atribuir cada arreglo sin el ruido del bot aleatorio (±10 %).

### Antes

| Skin    | Escritorio (GPU, 1x) | CPU 4x (GPU)        | Sin GPU, 1x      | Sin GPU + CPU 4x |
| ------- | -------------------- | ------------------- | ---------------- | ---------------- |
| clasico | 160 / 6,7 / 0,20     | 160 / 6,4 / 0,66    | 60 / 16,8 / 0,59 | 60 / 16,8 / 2,36 |
| neon    | 160 / 7,1 / 0,22     | 160 / 7,0 / 0,75    | 60 / 16,8 / 1,08 | 60 / 16,8 / 4,80 |
| retro   | 160 / 6,4 / 0,20     | 159,9 / 12,5 / 0,68 | 60 / 16,8 / 0,54 | 60 / 16,8 / 2,37 |

Game over: el canvas seguía dibujando detrás del modal (NEÓN: 243 `fillRect` + 243 `strokeRect` + 1215 `fill` + 2673 `stroke` en 1,5 s).

### Después

| Skin    | Escritorio (GPU, 1x) | CPU 4x (GPU)        | Sin GPU, 1x      | Sin GPU + CPU 4x |
| ------- | -------------------- | ------------------- | ---------------- | ---------------- |
| clasico | 160 / 6,7 / 0,20     | 160 / 6,5 / 0,64    | 60 / 16,8 / 0,60 | 60 / 16,8 / 2,09 |
| neon    | 160 / 6,4 / 0,23     | 160 / 6,7 / 0,74    | 60 / 16,8 / 0,96 | 60 / 16,8 / 4,07 |
| retro   | 160 / 7,2 / 0,19     | 159,9 / 12,5 / 0,66 | 60 / 16,8 / 0,60 | 60 / 16,8 / 2,24 |

Game over: 0 llamadas de dibujo en 1,5 s tras FIN, en las 3 skins. Si FIN llega con una explosión en curso, primero termina (≤ 1,1 s; se midieron 123–164 frames) y después se corta.

La baja sin GPU + CPU 4x (−5 a −15 %) está dentro del ruido del bot. El benchmark determinista de NEÓN (sin GPU + CPU 4x, ms/frame) no muestra diferencia: equivalente al original 4,98 / 5,04 / 5,36; solo allocaciones 4,95 / 5,03 / 5,16. Con GPU: 1,01 / 0,96 / 0,91 contra 1,01 / 0,95 / 0,92.

### Correcciones

1. **Freeze tras el game over** (regla 1): `loop` corta el rAF en `gameover` cuando ya no quedan partículas (deja terminar la explosión de la nave, lo único que `update` anima en esa fase). Las guardas de `endGame`/`restart`/`setSkin` ya estaban.
2. **Helpers con el contexto como parámetro** (regla 4): `paint(c, s)`, `drawBackground(c)`, `drawFrame(c)`, `draw(c)` de cada clase, y paths en coordenadas locales (`shipPath`, `flamePath`, `asteroidPath`, `boxPath`). Idéntico al píxel.
3. **Sin allocaciones por frame** (regla 5): `for` con índice en vez de `forEach`; `compactDead()` en el lugar en vez de `filter`/`concat`; `newAsteroids` reusado; sin spread en `push`; `reportState()` compara primitivos y solo arma `EngineState` + badge cuando algo cambió. El gameplay es el mismo: 27/27 estados idénticos al píxel en el arnés determinista. Efecto: higiene, sin diferencia medible.

**Probado y revertido** (medido con el benchmark determinista, NEÓN, CPU 4x):

- Halo del glow en sprite por asteroide, dibujado con `rotate`: +2 ms/frame (≈ +35 %) sin GPU. Un `drawImage` rotado de hasta 152×152 px por software cuesta más que el `shadowBlur`.
- Halos de las estelas por dirección × largo: sin ganancia, con tendencia peor.
- `bgCache` (fondo + grilla) y el marco con glow en una capa (4 franjas): +3 % sin GPU y +8 % con GPU.
- Sprites o halos de nave, llama, balas y power-up: neutros sin GPU (−1 %) y +6 % con GPU. Se sacaron porque no ganan nada y sumaban ~150 líneas.

En ROCAS el glow no es el costo dominante: dibujar sin `shadowBlur` (diagnóstico) solo bajaba de ~5,8 a ~4,0 ms. Lo que pesa es el raster vectorial (relleno + trazo + núcleo por asteroide). Las reglas 2, 3 y 6 quedan sin aplicar a propósito, y la 7 no aplica (no hay `clip`). El redibujo con `dirty` tampoco aplica: la escena se anima en cada frame.

**Veredicto:** antes, escritorio ✅, celular holgado (≤ 4,8 ms) y game over sin congelar ❌. Después, escritorio ✅, celular holgado (≤ 4,1 ms; sin cambio fuera del ruido) y game over congelado ✅.
