# Plantilla del spec de un juego

Referencia que consulta `/add-game` al escribir el spec. Sigue la misma
forma que `specs/05-rocas-asteroids-motor.md` y
`specs/06-ranking-global-catalogo-juegos-v0.2.0.md` — **no es una plantilla
paralela**, es esa misma forma con las secciones específicas de "agregar un
juego" ya resueltas. Si el spec skill general (`~/.claude/skills/spec/`) y
esta plantilla llegan a divergir, ganan las convenciones que ya están
implementadas en `specs/`.

---

## Encabezado

```markdown
# SPEC NN — <Título: nombre del juego + qué se hace con él>

> **Estado:** Borrador
> **Depende de:** 05-rocas-asteroids-motor[, 06-ranking-global-catalogo-juegos-v0.2.0 si el caso es C]
> **Fecha:** YYYY-MM-DD
> **Versión:** X.Y.Z → X.Y+1.0 (minor — package.json es la fuente de verdad)
> **Objetivo:** Una sola frase. Ej.: "Portar Tetris (references/started-games/03-tetris) como el motor real del juego CAÍDA."
```

`Depende de` siempre incluye `05-rocas-asteroids-motor` porque ese spec creó
el contrato del motor (`game-engine.ts`, `game-player-shell.tsx`,
`registry.ts`). Si el caso es **C** (juego nuevo sin fila en `games`), agregar
también `06-ranking-global-catalogo-juegos-v0.2.0` (dueño del esquema de
`games`).

El bump de versión es **minor** salvo que el usuario diga lo contrario en la
fase de preguntas — agregar un juego jugable es funcionalidad nueva visible,
no un fix ni un cambio interno.

## Alcance

```markdown
## Alcance

**Incluye:**

- `components/games/<id>/<archivo>.ts`: motor que exporta `create<Nombre>Engine: EngineFactory`, portado de `references/started-games/<carpeta>` [o: escrito desde cero].
- `components/games/registry.ts`: agrega la línea `<id>: () => import("./<id>/<archivo>").then((m) => m.create<Nombre>Engine),`.
- (Solo caso C) `sql/00N_add_game_<id>.sql`: `insert ... on conflict (id) do nothing` de la fila `<id>` en `games` (title, short, long, cat, cover, color, sort_order) — idempotente, nunca un `INSERT` a secas ni un `DROP`/`UPDATE` de filas existentes. Aplicado al proyecto real vía el MCP de Supabase (`apply_migration`), igual que specs 04/05/06.
- (Solo si el cover es nuevo) bloque `.cover-<slug>` en `app/globals.css`, sección "Cover art generators".
- `package.json`: version X.Y.Z → X.Y+1.0.
- `CHANGELOG.md`: entrada para X.Y+1.0 enlazando a este spec.

**Fuera de alcance (para futuros specs):**

- Controles táctiles/móvil (el contrato no los cubre hoy — `references/started-games` tampoco los tiene).
- Audio (ningún motor del repo reproduce sonido hoy).
- `devicePixelRatio` / escalado por densidad de píxeles.
- Validación en build de que cada clave de `registry.ts` tenga fila en `games` (spec 05 lo dejó fuera explícitamente).
- Cambios a `game-player-shell.tsx`, `game-engine.ts` o `app/actions/scores.ts` — el contrato ya cubre este juego sin tocarlos; si no alcanzara, es señal de que el contrato necesita su propio spec, no un parche de paso.
```

## Modelo de datos

Sin nuevas tablas — reusa `scores`/`games` de specs 04/06. Documentar:

1. **Tabla de puntuación** — qué evento suma/resta cuántos puntos (enteros).
2. **Mapeo a `EngineState`** — qué va en `score`/`lives`/`level`/`badge`, y
   cómo se colapsan los estados internos del juego a `EnginePhase`
   (`"playing" | "paused" | "gameover"`).
3. **Controles** — tabla tecla/acción, y si hace falta `preventDefault()`.
4. **(Solo caso C)** la fila nueva de `games`, con sus 7 columnas.

Ejemplo de diagrama de flujo (obligatorio, mínimo un Mermaid — regla del
skill `/spec`), con labels literales y las que empiezan con `/` entre
comillas:

```markdown
​`mermaid
flowchart LR
  games[("games")] --> libGames["lib/games.ts"]
  libGames --> jugarPage["/juegos/:id/jugar"]
  jugarPage --> registry["components/games/registry.ts"]
  registry --> engine["components/games/<id>/<archivo>.ts"]
  engine -->|"onState()"| shell["game-player-shell.tsx"]
  shell -->|"saveScore(gameId, score)"| scoresAction["app/actions/scores.ts"]
  scoresAction --> scores[("scores")]
​`
```

Caso **C** agrega también un `erDiagram` con la fila nueva insertándose en la
tabla `games` ya existente (mismos campos que `sql/004_recreate_games_table.sql`).

Si el feature no introduce estructuras nuevas más allá de lo anterior,
decirlo explícitamente en vez de omitir la sección.

## Plan de implementación

Numerado, cada paso termina en "Test manual: …", cada uno commiteable y deja
el sistema funcional. Orden que respeta la dependencia real (el FK
`scores_game_id_fkey` exige que la fila de `games` exista antes de que
cualquier score se pueda guardar):

```markdown
## Plan de implementación

1. (Solo caso C) `sql/00N_add_game_<id>.sql` con `insert ... on conflict (id) do nothing` de la fila. Aplicar con el MCP de Supabase (`apply_migration`) y verificar con `list_tables`/`get_advisors`. Test manual: `select * from games where id = '<id>'` devuelve la fila.
2. (Solo si el cover es nuevo) bloque `.cover-<slug>` en `app/globals.css`. Test manual: `/games` muestra la portada nueva (aunque el juego todavía no tenga motor, la fila ya existe y la card se renderiza).
3. Esqueleto del motor en `components/games/<id>/<archivo>.ts`: factory, `ctx`, los 6 métodos del `EngineHandle`, el loop RAF, `reportState()` sin lógica de juego todavía. Test manual: `npm run lint`.
4. [n pasos de mecánica del juego, cada uno ≤ 30-50 líneas]. Test manual: [acción concreta jugable].
5. Línea en `components/games/registry.ts` con `import()` dinámico. Test manual: entrar a `/juegos/<id>/jugar` y ver el motor real en vez del mock.
6. `package.json` version bump + entrada en `CHANGELOG.md`. Test manual: el Footer muestra `vX.Y+1.0`.
7. Verificación end-to-end completa (ver sección homónima en `add-game-impl/SKILL.md`). Test manual: partida completa con sesión activa, una fila nueva en `scores`, reflejada en `/juegos/<id>`, `/games` y `/salon-de-la-fama`.
```

## Criterios de aceptación

Checklist booleano, derivado de los 23 criterios de spec 05. Adaptar la lista
completa al juego concreto; como mínimo:

```markdown
## Criterios de aceptación

- [ ] El motor exporta `create<Nombre>Engine` cumpliendo `EngineFactory`.
- [ ] `registry.ts` carga el motor con `import()` dinámico (no import estático).
- [ ] El HUD (`player-hud`) refleja score/vidas/nivel reales del motor, nada hardcodeado.
- [ ] El canvas no dibuja su propio texto de HUD ni overlay de pausa/game over.
- [ ] PAUSA congela la simulación real (el RAF se cancela, no solo un flag visual).
- [ ] REANUDAR continúa sin salto de física (dt no incluye el tiempo en pausa).
- [ ] FIN fuerza game over con el score actual en cualquier momento.
- [ ] Perder (o la condición de fin del juego) abre el modal de game over.
- [ ] Con sesión activa, una partida terminada crea exactamente una fila nueva en `scores`.
- [ ] Sin sesión, el modal muestra el CTA a `/auth` y no se guarda nada.
- [ ] Si el guardado falla, se muestra el error con botón REINTENTAR.
- [ ] "JUGAR DE NUEVO" reinicia el motor sin remontar el componente.
- [ ] "VOLVER AL VAULT" navega a `/juegos/<id>`.
- [ ] Salir de la página cancela el RAF y saca los listeners del motor (sin fugas al entrar/salir repetidas veces).
- [ ] Visitar otro juego no descarga el chunk de este motor.
- [ ] `/juegos/<id>` ("Mejor global", "Partidas") y `/salon-de-la-fama` (tab del juego y tab GLOBAL) reflejan la partida sin intervención manual.
- [ ] `npm run lint` y `npm run build` sin errores.
- [ ] (Solo caso C) la fila de `games` tiene RLS de solo lectura y `get_advisors` no reporta hallazgos nuevos.
```

## Decisiones

`- **Sí:** ... (razón).` / `- **No:** ... (razón).` — como mínimo registrar:
qué se decidió para vidas/nivel/badge si el juego original no tiene un
equivalente directo (ver `motor-referencia.md` §4 para tetris/arkanoid), y
por qué el bump de versión es el elegido.

## Riesgos

Tabla `| Riesgo | Mitigación |` — incluir siempre, si aplica: coordenadas de
puntero mal escaladas, asset binario que no llegó a `public/`, o el motor
reportando un score no entero.

## Lo que **no** está en este spec

Repetir el cierre de "Fuera de alcance" — sirve como recordatorio para quien
lee solo el final del documento.
