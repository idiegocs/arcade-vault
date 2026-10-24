# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada versión
corresponde a un spec (`specs/NN-slug-vX.Y.Z.md`) — ver ese spec para el detalle completo de
alcance, decisiones y criterios de aceptación.

## [0.6.0] - 2026-10-24

Spec: [`15-autenticacion-oauth-v0.6.0`](specs/15-autenticacion-oauth-v0.6.0.md)

### Added

- Entrar con Google o con GitHub. Si el correo coincide con el de una cuenta existente, se vincula a esa cuenta. Si no, se crea una con un usuario generado a partir del nombre de GitHub o del correo.
- Entrar con el usuario o con el correo, en el mismo campo.
- "¿Olvidaste tu contraseña?": un enlace por correo lleva a `/auth/restablecer` para elegir una contraseña nueva.
- Aviso "REVISA TU CORREO" al registrarse, si el proyecto pide confirmar el correo.
- Ícono del método de ingreso junto al usuario en el Nav (✉ correo, ◆ Google, ▣ GitHub). Al pasar el mouse muestra con qué cuenta se entró.

### Changed

- El registro valida el usuario (3 a 16 caracteres: letras, números o `_`, sin repetir), el correo y la contraseña (mínimo 8 caracteres).
- Los errores de inicio de sesión y registro se muestran en español. Un usuario inexistente y una contraseña incorrecta dan el mismo mensaje.
- Después de entrar se vuelve a la página desde la que se hizo clic en "Iniciar Sesión". Con la sesión iniciada, `/auth` lleva al inicio.
- JUGAR COMO INVITADO lleva a la biblioteca de juegos.
- La pantalla de acceso muestra la versión real de la app, que antes decía `v2.6`.

## [0.5.3] - 2026-10-17

Spec: [`14-rendimiento-motores-v0.5.2`](specs/14-rendimiento-motores-v0.5.2.md) (aplicado a CAÍDA y ROCAS)

### Added

- `references/rendimiento-juegos.md`: registro de las corridas de `@game-performance-booster`, con mediciones antes y después por skin.

### Changed

- CAÍDA dibuja menos: el fondo, el brillo de NEÓN y los bloques ya fijados se dibujan una vez y se reutilizan, y el canvas solo se redibuja cuando algo cambia. En el peor caso medido (sin GPU, CPU 4x), el trabajo por frame baja de 3,95 a 1,04 ms en NEÓN y de ~2,3 a ~1 ms en CLÁSICO y RETRO. Se ve igual en las 3 skins.
- CAÍDA y ROCAS dejan de redibujar tras el game over: el canvas queda quieto detrás del modal hasta JUGAR DE NUEVO (ROCAS primero deja terminar la explosión de la nave).
- ROCAS dibuja sin crear objetos por frame. El brillo en sprites del spec 14 se probó y se descartó en ROCAS: hacía NEÓN más lento.

## [0.5.2] - 2026-10-12

Spec: [`14-rendimiento-motores-v0.5.2`](specs/14-rendimiento-motores-v0.5.2.md)

### Added

- Contador de FPS en el reproductor, solo en desarrollo: FPS promedio y peor frame, en una esquina de la pantalla del CRT.
- Sección "Rendimiento" en `components/games/README.md` y en la referencia del skill `add-game`, con las reglas de dibujo para los motores nuevos.

### Changed

- RANARIA corre fluida en celular: el fondo y todo lo que brilla en NEÓN se dibujan una vez por skin y se reutilizan. En el peor caso medido (sin GPU, CPU 4x), el trabajo por frame en NEÓN baja de 16,1 a 3 ms. Se ve igual en las 3 skins.
- RANARIA deja de redibujar tras el game over: el canvas queda quieto detrás del modal hasta JUGAR DE NUEVO.
- Mientras se juega, la grilla animada del fondo de la página queda quieta. En el resto de las páginas sigue animada.

## [0.5.1] - 2026-10-12

Spec: [`game-jam/03-Frogger/01-frogger-core`](specs/game-jam/03-Frogger/01-frogger-core.md)

### Added

- Motor real del juego RANARIA (Frogger), escrito desde cero: cuadrícula de 16×14 celdas de 40px con saltos discretos (flechas + WASD), carretera de 5 carriles con coches y camiones, río de 6 carriles con troncos y tortugas que se sumergen, 5 bocas destino por ronda, 3 vidas y temporizador de 30 s por viaje (1 s menos por nivel, mínimo 8 s). Cada ronda completa sube el nivel y acelera todo un 15 %.
- Puntuación de RANARIA: +10 por fila nueva de la ronda, +50 por boca, +10 por segundo restante al ocupar una boca y +200 por ronda completa. Techo de cordura de 100.000 en `saveScore`.
- Sonidos en RANARIA (salto, atropello, agua, boca, ronda) y música de fondo TURBO por defecto.

## [0.5.0] - 2026-10-03

Spec: [`13-musica-de-fondo-v0.5.0`](specs/13-musica-de-fondo-v0.5.0.md)

### Added

- Música de fondo chiptune, sintetizada con Web Audio (sin archivos), en los 4 juegos con motor. Catálogo de 4 pistas originales, cada una la de un juego por defecto: BLOQUES (CAÍDA), ÓRBITA (ROCAS), TURBO (BLOQUE BUSTER) y JARDÍN (SERPENTINA).
- La música sigue a la partida: se pausa con la pausa (también la automática), se detiene en game over, vuelve a empezar con JUGAR DE NUEVO y se calla al salir del reproductor. Respeta el ♪ del nav en vivo, sin reiniciar la pista.
- Panel de ajustes ⚙ en el reproductor, en desktop y táctil, con la skin, la pista (cualquiera de las 4 o SIN MÚSICA) y el volumen de la música (0–100, por defecto 30). Abrirlo pausa la partida y cerrarlo la reanuda solo si la pausó el panel. Se recuerdan el volumen (global) y la pista de cada juego.
- Campo `music` en `components/games/registry.ts` para la pista por defecto de cada juego.

### Changed

- El HUD del reproductor muestra los datos de la partida y los íconos ⚙ ❚❚ ■ ⤢ ✕ también en desktop. La skin pasa al panel de ajustes. En táctil, el HUD va en una fila compacta y sin "Jugador".
- En escritorio, el gabinete CRT se ajusta al alto de la ventana para que el juego entre sin scroll. En pantalla completa, la pantalla del juego ocupa todo el espacio que deja el HUD.
- En pantalla completa en celular vertical, todo entra sin scroll: HUD arriba, juego centrado y mandos abajo.
- CAÍDA ya no sortea la pieza O (cuadrado 2×2).

## [0.4.0] - 2026-10-03

Spec: [`12-controles-tactiles-movil-v0.4.0`](specs/12-controles-tactiles-movil-v0.4.0.md)

### Added

- Gamepad virtual para jugar en celulares y tablets: los 4 juegos con motor (CAÍDA, ROCAS, BLOQUE BUSTER, SERPENTINA) se pueden jugar con pantalla táctil. El gamepad tiene una cruceta (siempre ▲▼◀▶; las direcciones que el juego no usa se ven apagadas) y botones de acción de arcade. Cada botón emite la misma tecla que ya entiende el motor, así que ningún motor cambió. Soporta multitouch y repetición al mantener (CAÍDA). Solo aparece en dispositivos táctiles.
- En horizontal, "modo juego": el reproductor ocupa toda la pantalla, con la cruceta a la izquierda del canvas y las acciones a la derecha.
- Botón de pantalla completa en el reproductor (oculto en navegadores que no lo soportan, como iPhone Safari).
- Pausa automática al cambiar de pestaña o app, o al bloquear el celular. Al volver, el juego queda en pausa hasta tocar REANUDAR.
- Vibración al perder una vida y en game over (Android; en iOS no hace nada).
- Campo `touchControls` en `components/games/registry.ts` para declarar el gamepad de cada juego.

### Changed

- En táctil, el HUD del reproductor se compacta: el skin es un desplegable y PAUSA/FIN/SALIR son íconos.
- En celulares (≤520px), el nav muestra solo el logo y el menú (♪ e Iniciar sesión siguen dentro del menú). Antes desbordaba la pantalla.
- Durante la partida, Espacio y las flechas ya no hacen scroll de la página ni activan el botón del HUD con foco.
- Rendimiento: el fondo animado del sitio se apaga mientras el reproductor tapa toda la pantalla, y las scanlines del CRT ya no usan `mix-blend-mode`.
- `next.config.ts`: `allowedDevOrigins` para poder abrir el dev server desde un celular en la red local.

## [0.3.0] - 2026-09-27

Sin spec: implementado con el agente `@skin-designer` (`.claude/agents/skin-designer.md`),
tomando CAÍDA como referencia. Ver la sección "Skins" de `components/games/README.md`.

### Added

- Skins visuales CLÁSICO (default), NEÓN y RETRO en los 4 juegos con motor (CAÍDA, SERPENTINA, ROCAS, BLOQUE BUSTER), elegibles desde un selector en el HUD del reproductor. El cambio es en vivo, sin reiniciar la partida, y la elección se recuerda por juego. CLÁSICO conserva el look original; NEÓN dibuja tubos huecos con glow sobre un fondo synthwave; RETRO usa los 4 verdes de Game Boy con bordes duros y marcas de patrón. Solo visual: física, puntaje, controles y sonidos no cambian.
- Contrato de skins en el motor (`REQUIRED_SKINS`, `SkinId`, `options.skin`, `setSkin`) y campo `skins` en `components/games/registry.ts`.

## [0.2.5] - 2026-09-20

Change: [`11-score-plausibility-caps-v0.2.5`](openspec/changes/11-score-plausibility-caps-v0.2.5/proposal.md)
(primer change trackeado con OpenSpec en vez de `specs/`)

### Added

- Validación server-side de puntuaciones en `saveScore`: rechaza cualquier score por encima de un techo máximo plausible por juego, en vez de aceptar cualquier entero no negativo. BLOQUE BUSTER tiene un techo exacto (2080, derivado de sus 208 bloques en 5 niveles fijos); ROCAS, CAÍDA y SERPENTINA (efectivamente sin fin) tienen un techo de cordura generoso. Un `game_id` sin techo configurado (los 4 juegos del catálogo sin motor todavía) rechaza cualquier puntuación.

## [0.2.4] - 2026-09-13

Spec: [`10-serpentina-snake-motor-v0.2.4`](specs/10-serpentina-snake-motor-v0.2.4.md)

### Added

- Motor real del juego SERPENTINA (Snake), escrito desde cero sobre una grilla de 40×30 celdas de 20px: movimiento discreto que acelera por nivel, doble esquema de controles (flechas + WASD), fruta con sprite real migrado de `references/source-asset/snake-assets/fruits.png`, y sistema de 3 vidas que resetea la serpiente a longitud 3 sin resetear score/nivel.
- Sonidos en SERPENTINA: comer fruta, choque.

## [0.2.3] - 2026-09-13

Spec: [`09-bloque-buster-arkanoid-motor-v0.2.3`](specs/09-bloque-buster-arkanoid-motor-v0.2.3.md)

### Added

- Motor real del juego BLOQUE BUSTER (Arkanoid), portado de `references/started-games/04-arkanoid`: los 5 niveles originales (layouts de bloques y velocidad de pelota crecientes, `1.00 → 1.46`), control de paleta por teclado y mouse, física de colisiones con animación de explosión por bloque, y sistema de 3 vidas que repone la pelota sin resetear score/nivel/bloques restantes.
- Sonidos en BLOQUE BUSTER: rebote de pelota, bloque destruido, pérdida de vida.

## [0.2.2] - 2026-09-12

Spec: [`08-libreria-sonido-motores-v0.2.2`](specs/08-libreria-sonido-motores-v0.2.2.md)

### Added

- `components/games/audio.ts`: librería de sonido transversal — efectos sintetizados con Web Audio API (osciladores, sin archivos de audio), y un control de mute persistido en `localStorage`.
- Ícono de mute/unmute global en la Nav (escritorio y panel móvil).
- Sonidos en ROCAS: disparo, impacto de bala en asteroide, explosión de la nave, recoger power-up.
- Sonidos en CAÍDA: rotar pieza, caída (suave/dura), línea completada, topout.

## [0.2.1] - 2026-09-12

Spec: [`07-caida-tetris-motor-v0.2.1`](specs/07-caida-tetris-motor-v0.2.1.md)

### Added

- Motor real del juego CAÍDA (Tetris), portado de `references/started-games/03-tetris`: las 8 piezas del original (7 tetrominós + la "tuerca"), caída suave/dura, rotación con wall-kick, pieza fantasma y vista previa de "próxima pieza" dibujada dentro del mismo canvas.
- Sistema de 3 vidas propio de este port: un topout limpia el tablero y resta una vida en vez de terminar la partida; `score`/`level`/líneas acumuladas no se resetean entre vidas.

## [0.2.0] - 2026-09-05

Spec: [`06-ranking-global-catalogo-juegos-v0.2.0`](specs/06-ranking-global-catalogo-juegos-v0.2.0.md)

### Added

- Tabla `games` real en Supabase (catálogo de los 8 juegos, id de texto/slug, RLS de solo lectura), en reemplazo del array estático `lib/data.ts`.
- Ranking global de jugadores: tab "GLOBAL" en el Salón de la Fama (nueva y por defecto), suma de todos los puntajes históricos de cada jugador en cualquier juego.
- `lib/games.ts` (`getGames`, `getGameById`) y funciones nuevas en `lib/scores.ts` (`getPlaysCount`, `getGlobalTopPlayers`).
- La versión de la app se muestra en el Footer, leída en tiempo real desde `package.json`.

### Changed

- El detalle de cada juego (`/juegos/[id]`) muestra el leaderboard real de `scores` en vez de datos de ejemplo generados al azar; el contador "Partidas" ahora es un conteo real.
- `scores.game_id` tiene ahora una foreign key real hacia `games.id`.

### Fixed

- `getGames()`/`getGameById()` ya no confunden un error real de Supabase con "catálogo vacío"/"juego no existe" — ahora lanzan.
- `/salon-de-la-fama` restaura el fallback al primer juego cuando `?game=` no coincide con ningún id real (antes caía silenciosamente en GLOBAL).
- `saveScore` ya no expone el mensaje crudo de Postgres al usuario si el insert falla.

### Removed

- `lib/data.ts` (catálogo estático de juegos, ya sin uso).
- `getPlaysCountByGames` (código muerto, nunca se conectó a ninguna UI).

## [0.1.0] - 2026-07-09 a 2026-08-31

Versión inicial del proyecto — nunca se versionó explícitamente hasta adoptar esta convención
en el spec 06. Agrupa todo lo construido en los specs 01 a 05, resumido a partir del historial
de git.

### Added

- Scaffold inicial de Next.js (`create-next-app`) y configuración del proyecto (Prettier, ESLint, hook de formato).
- Diseño visual MVP completo: home, navegación, tarjetas de juego, detalle de juego, Salón de la Fama y reproductor de juego (mock) — spec 01.
- Separación de Home y Biblioteca de juegos (`/games`) en rutas propias, con nuevo layout y animaciones — spec 02.
- Página "Acerca de" con formulario de contacto funcional por email (Resend) — spec 03.
- Autenticación real con Supabase (email/contraseña), esquema de tablas `profiles`/`scores`, y Salón de la Fama / "mejor puntaje" conectados a datos reales — spec 04.
- Motor real del juego ROCAS (Asteroids): HUD en vivo, pausa, modal de fin de partida y guardado real de puntuaciones en Supabase — spec 05.
