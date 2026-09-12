---
name: add-game-impl
description: Implementa un spec de juego aprobado (motor + registry + fila en Supabase si hace falta + cover CSS si hace falta). Valida que el Estado sea Aprobado, crea la branch, implementa paso a paso con pausas, y verifica el guardado real de puntuación en Supabase antes de cerrar.
disable-model-invocation: true
argument-hint: <NN-spec-del-juego>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*)
---

# /add-game-impl — Implementador de specs de juego

## Contexto de sesión

Estado del repo:
!`git status --short`

Branch actual:
!`git branch --show-current`

Specs disponibles:
!`ls specs/ 2>/dev/null || echo "specs/ no existe"`

Configuración de creación de branch:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, sin archivo de config)"`

Motores ya registrados:
!`cat components/games/registry.ts 2>/dev/null`

---

Este skill es la contraparte de `/add-game`, especializada en specs cuyo
plan agrega un motor de juego bajo `components/games/`. Comparte la mecánica
de fases con `/spec-impl` (gate de `Aprobado`, branch, pasos con pausa) pero
conoce los gotchas específicos del contrato de motor — leelos de
`.claude/skills/add-game/motor-referencia.md` antes de escribir una sola
línea de motor.

## Fase 1 — Identificar el spec

El argumento recibido es: `$ARGUMENTS`

Si viene vacío: listar `specs/` (ya lo tenés arriba), pedir el nombre exacto,
parar y esperar.

Si viene con valor: buscarlo en `specs/` (nombre completo, solo el número, o
solo el slug). Si no aparece, mostrar los specs disponibles y pedir que lo
corrijan.

Si el spec encontrado **no** menciona un motor bajo `components/games/` en
su Alcance/Plan (es decir, no es un spec de juego), avisarlo y sugerir
`/spec-impl` en su lugar — este skill asume los pasos específicos de motor
que `/spec-impl` no conoce.

## Fase 2 — Validar el gate

Leer el spec. Buscar la línea de estado (`**Estado:**` u homólogo). Igual
que `/spec-impl`: **solo se continúa si el valor significa "Aprobado"** en
cualquier idioma (`Aprobado`, `Approved`, ...). Cualquier otro valor —
`Borrador`, `En revisión`, `Implementado`, `Obsoleto`, o algo irreconocible —
para acá con este mensaje:

```
❌ No puedo implementar este spec.

Estado actual: [ESTADO ENCONTRADO]
Solo trabajo con specs cuyo estado signifique "Aprobado".

Para continuar tenés dos opciones:
  1. Si el spec ya está listo, abrilo y cambiá el estado a "Aprobado"
     a mano. Ese cambio lo hace el humano, no el agente.
  2. Si el spec todavía necesita trabajo, usá /add-game [juego] para
     retomarlo.
```

No ofrecer alternativas, no sugerir "puedo arrancar igual si querés" — el
bloqueo es intencional.

## Fase 3 — Branch

1. Preguntar el tipo de branch (`feature`/`fix`/`chore`/`refactor`, default
   `feature` — casi siempre es `feature` porque se está agregando algo
   nuevo). Preguntar siempre, aunque parezca obvio.
2. Derivar `<tipo>/spec-NN-slug[-vNEW]` (con el sufijo de versión si el
   encabezado tiene una línea `Versión: OLD → NEW`).
3. Leer `AutoCreateBranch` de `specs/.spec-config.yml` (default `true` si
   falta el archivo o el valor). Si es `true`, crear/cambiar a la branch sin
   preguntar (avisando si ya existía). Si es `false`, pedir confirmación
   `[y/N]` antes de tocar git.
4. Confirmar branch activa, y mostrar del spec: objetivo, alcance, plan y
   criterios de aceptación.

## Fase 4 — Implementar paso a paso

Antes del primer paso: leer `.claude/skills/add-game/motor-referencia.md`
completo. Es la fuente de los patrones de idempotencia, el reporte de
estado con diff, y los casos particulares de tetris/arkanoid si aplican.

Decir: "Voy a implementar el spec siguiendo el plan al pie de la letra. Paro
después de cada paso para que revises el diff. ¿Arrancamos con el paso 1?" y
esperar confirmación explícita.

**Orden que no se reordena** — la fila de `games` tiene que existir antes de
que cualquier score se pueda guardar (FK `scores_game_id_fkey`):

1. **(Solo caso C — juego nuevo)** Crear `sql/00N_add_game_<id>.sql` con
   `insert into games (...) values (...) on conflict (id) do nothing;`
   — idempotente, nunca un `INSERT` a secas ni tocar filas existentes
   (siguiendo el estilo minúsculas de `sql/004_recreate_games_table.sql`).
   Antes de fijar `sort_order`, releer el catálogo en vivo
   (`select max(sort_order) from games`) por si el spec quedó desactualizado
   entre diseño e implementación — usar `max + 1`, no el número que asumió
   el spec si ya no es el máximo. Aplicar con `mcp__supabase__apply_migration`.
   Verificar con `mcp__supabase__list_tables` y `mcp__supabase__get_advisors`
   (tipo `security`) — no debe haber hallazgos nuevos. Test manual:
   `select * from games where id = '<id>'` devuelve la fila esperada.
2. **(Solo si el cover es nuevo)** Agregar el bloque `.cover-<slug>` a la
   sección "Cover art generators" de `app/globals.css`, siguiendo el patrón
   de los 8 covers existentes (gradientes/`::before`/`::after` con los
   tokens `var(--cyan|--magenta|--yellow|--green|--ink)`, rematado con
   `filter: drop-shadow(...)`). Test manual: `/games` muestra la card con la
   portada nueva.
3. Esqueleto del motor en `components/games/<id>/<archivo>.ts`: la factory,
   `ctx`, los 6 métodos de `EngineHandle` (con sus guardas de idempotencia
   copiadas de `motor-referencia.md` §2), el loop RAF, `reportState()` con
   diff — sin la mecánica de juego todavía. Test manual: `npm run lint`
   limpio.
4. Mecánica del juego, en los pasos que haga falta según el spec (cada uno
   ≤ 30-50 líneas). Cada paso deja el motor jugable hasta donde llegó, aunque
   todavía no esté conectado al registry.
5. Línea en `components/games/registry.ts` — `import()` dinámico, nunca un
   import estático arriba del archivo. Test manual: entrar a
   `/juegos/<id>/jugar` y confirmar que aparece el motor real (no el mock
   hardcodeado de score `12450`).
6. Bump de `package.json` + entrada en `CHANGELOG.md` (Keep a Changelog,
   es-ES, enlazando a este spec) — **agregar esto aunque el paso del plan no
   lo mencione explícitamente**, misma regla que `/spec-impl`. Test manual:
   el Footer muestra la versión nueva.
7. Verificación end-to-end (sección siguiente).

Ritmo de trabajo: un paso, mostrar qué archivos se tocaron y qué se hizo,
"Paso N completado. ¿Revisás el diff y seguimos con el paso N+1?", esperar
confirmación.

**Si aparece una ambigüedad que el spec no resuelve:** parar, describirla,
dar 2-3 opciones concretas, esperar la decisión. No improvisar.

**Si el usuario pide algo fuera del alcance del spec:** recordar que está
fuera de alcance, sugerir anotarlo para otro spec, no implementarlo en esta
branch.

**Reglas duras de esta fase:**

- Implementar lo que dice el spec. Si algo parece subóptimo, decirlo como
  observación pero implementar lo acordado — un cambio de spec va al spec,
  no al código por sorpresa.
- **Nunca tocar** `components/games/game-player-shell.tsx`,
  `components/games/game-engine.ts` ni `app/actions/scores.ts`. Si el plan
  del spec los incluye, es un spec mal alcanzado — parar y preguntar antes
  de tocarlos.
- El motor no llama a `saveScore` ni conoce la sesión — eso es 100% del
  shell, ya implementado.

## Verificación end-to-end

Antes de dar el spec por terminado, confirmar en orden:

1. `npm run lint` y `npm run build` sin errores (el build corre TypeScript
   — cualquier tipo mal cerrado en el motor lo revienta acá).
2. Con Playwright (`mcp__playwright__browser_navigate` +
   `browser_snapshot`/`browser_take_screenshot`): entrar a
   `/juegos/<id>/jugar`, confirmar que el HUD muestra valores reales del
   motor (no el mock), que PAUSA congela la partida y REANUDAR la retoma sin
   saltos, y que FIN abre el modal de fin de partida con el score actual.
3. **Guardar un puntaje requiere sesión activa** — un invitado ve el CTA a
   `/auth` en el modal y no se guarda nada; eso es esperado, no un bug. Para
   probar el guardado hace falta loguearse primero (`/auth`). Con sesión:
   jugar hasta game over, confirmar el toast `▸ PUNTUACIÓN GUARDADA_`.
4. Confirmar con el MCP de Supabase que se creó **exactamente una** fila
   nueva: `select count(*) from scores where game_id = '<id>'` antes y
   después de la partida.
5. Confirmar que esa fila se refleja **sin intervención manual** en
   `/juegos/<id>` (Partidas, Mejor global, tabla de mejores puntuaciones),
   en `/games` (badge de récord en la card), y en `/salon-de-la-fama` (tab
   del juego puntual y tab GLOBAL).
6. Confirmar aislamiento de chunks: entrar a otro juego no descarga el chunk
   de este motor (`mcp__playwright__browser_network_requests` o la pestaña
   Network).
7. Salir de `/juegos/<id>/jugar` y volver a entrar varias veces sin que se
   acumulen listeners de teclado ni instancias de RAF corriendo en paralelo
   (el riesgo que spec 05 marcó explícitamente).

Nota de permisos: `.claude/settings.local.json` habilita el MCP de Supabase
y algunos tools de Playwright, pero no todos (`browser_click`,
`browser_press_key`, `apply_migration` piden confirmación al correr) — es
esperado, no un error.

## Fase 5 — Cierre

```
✅ Todos los pasos del plan están implementados.

Siguiente paso: verificar los criterios de aceptación del spec uno por uno.
Si todos pasan, actualizá el estado del spec a "Implementado" y hacé el
commit final antes de mergear esta branch.
```
