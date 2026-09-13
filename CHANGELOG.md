# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Cada versión
corresponde a un spec (`specs/NN-slug-vX.Y.Z.md`) — ver ese spec para el detalle completo de
alcance, decisiones y criterios de aceptación.

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
