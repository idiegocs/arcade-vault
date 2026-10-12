---
name: spec-impl-game
description: Implementa un spec de juego aprobado siguiendo /spec-impl (gate de Aprobado, branch, pasos con pausa) más las reglas de motor de /add-game-impl, y al terminar encadena — uno después del otro, nunca en paralelo — @skin-designer y luego @mobile-porter sobre el juego implementado.
disable-model-invocation: true
argument-hint: <NN-spec-del-juego>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*)
---

# /spec-impl-game — Implementador de specs de juego + skins + móvil

## Contexto de sesión

Estado del repo:
!`git status --short`

Branch actual:
!`git branch --show-current`

Specs disponibles:
!`ls specs/ 2>/dev/null || echo "specs/ no existe"`

Configuración de creación de branch:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, sin archivo de config)"`

Skill base `/spec-impl` instalado:
!`cat ~/.claude/skills/spec-impl/SKILL.md >/dev/null 2>&1 && echo OK || echo FALTA`

---

Este skill **no reescribe** `/spec-impl`: lo reutiliza. `/spec-impl` es un
skill de usuario con `disable-model-invocation: true`, así que no se puede
invocar con la herramienta Skill — en su lugar se lee su `SKILL.md` y se
siguen sus fases al pie de la letra. Encima de esa base se suman las reglas
de motor de `/add-game-impl` y, al final, la cadena de agentes
`@skin-designer` → `@mobile-porter`.

Respondé en el idioma del usuario (en este repo, español).

## Reporte de avance en consola

Algunas tareas tardan (build, Playwright, los dos agentes), así que el
usuario tiene que ver siempre en qué punto está el comando. Antes de cada
herramienta lenta y al cambiar de etapa, imprimí una línea corta con este
formato:

```
▸ [Fase X/6 · <etapa>] <qué estoy haciendo ahora>
```

Reglas:

- **Al entrar a cada fase:** `▸ [Fase 4/6 · Implementación] Paso 3/7 — esqueleto del motor`.
- **Antes de una tarea lenta**, avisá que va a tardar y qué se espera:
  `▸ [Fase 4/6 · Verificación] Corriendo npm run build (puede tardar ~1 min)…`.
  Al terminar: `✓ build OK` o `✗ build falló — <motivo en una línea>`.
- **Verificación e2e:** una línea por chequeo, numerada
  (`▸ [e2e 3/7] Guardado real en Supabase…` → `✓`/`✗`).
- **Agentes:** al lanzar cada uno, `▸ [Fase 5/6 · Agentes 1/2] Lanzando @skin-designer sobre <game-id>…` y la
  aclaración "esto puede tardar varios minutos; te aviso cuando termine".
  Si corre en segundo plano, decí que sigue corriendo cuando el usuario
  pregunte, sin inventar su resultado. Al recibir la notificación:
  `✓ @skin-designer terminó — <resumen en una línea>` y recién ahí
  `▸ [Fase 5/6 · Agentes 2/2] Lanzando @mobile-porter…`.
- **Checklist acumulado:** al cerrar cada fase (y en cada pausa entre pasos)
  mostrá el estado completo para que se vea el avance de un vistazo:

  ```
  [✓] 0 Base cargada     [✓] 1 Spec        [✓] 2 Gate Aprobado
  [✓] 3 Branch           [~] 4 Implementación (paso 3/7)
  [ ] 5 skin-designer    [ ] 5 mobile-porter    [ ] 6 Cierre
  ```

  (`[✓]` hecho, `[~]` en curso, `[✗]` falló, `[ ]` pendiente).
- Líneas cortas: el avance no reemplaza los resúmenes de diff de cada paso,
  los acompaña.

## Fase 0 — Cargar la base

1. Si arriba dice `FALTA`, parar acá:

   ```
   ❌ No encuentro el skill base /spec-impl (~/.claude/skills/spec-impl/SKILL.md).
   Instalalo con: npx skills@latest add Klerith/fernando-skills
   ```

2. Leer **completo** `~/.claude/skills/spec-impl/SKILL.md` con Read. Sus
   Fases 1–4 son el esqueleto de este comando: donde abajo dice "según
   spec-impl", se aplica exactamente lo que dice ese archivo (incluidos sus
   mensajes estándar), usando `$ARGUMENTS` como argumento.
3. Leer `.claude/skills/add-game-impl/SKILL.md` — de ahí salen las reglas
   de juego de la Fase 4 y la verificación end-to-end.

## Fase 1 — Identificar el spec (según spec-impl)

Igual que la Fase 1 de spec-impl. Agregado: si el spec encontrado **no**
agrega ni modifica un motor bajo `components/games/` en su Alcance/Plan,
avisarlo y sugerir `/spec-impl` en su lugar — la cadena de skins y móvil
no tiene sentido para un spec que no es de juego. Parar.

## Fase 2 — Gate de "Aprobado" (según spec-impl)

Igual que la Fase 2 de spec-impl, con su mensaje de error estándar. Sin
alternativas: el bloqueo es intencional.

## Fase 3 — Branch y resumen (según spec-impl)

Igual que la Fase 3 de spec-impl: preguntar siempre el tipo de branch,
derivar `<tipo>/spec-NN-slug[-vNEW]`, respetar `AutoCreateBranch`, confirmar
la branch activa y mostrar objetivo, alcance, plan y criterios de
aceptación.

## Fase 4 — Implementar paso a paso (spec-impl + reglas de juego)

El ritmo es el de la Fase 4 de spec-impl: confirmación explícita antes del
paso 1, un paso por vez, resumen de archivos tocados, pausa
("Paso N completado. ¿Revisás el diff y seguimos con el paso N+1?"),
ambigüedad → parar con 2–3 opciones, fuera de alcance → no implementarlo, y
el bump de versión siempre con su entrada en `CHANGELOG.md`.

Además aplican las reglas de la sección **"Fase 4 — Implementar paso a
paso"** de `.claude/skills/add-game-impl/SKILL.md` (leelas de ahí, no se
duplican acá). En resumen:

- Antes del paso 1, leer completo `.claude/skills/add-game/motor-referencia.md`.
- Orden que no se reordena: SQL idempotente de `games` (caso C, con
  `max(sort_order) + 1` leído en vivo) → cover CSS (si es nuevo) →
  esqueleto del motor → mecánica → entrada en `registry.ts` (`import()`
  dinámico + `maxPlausibleScore`) → bump + CHANGELOG.
- **Nunca tocar** `components/games/game-player-shell.tsx`,
  `components/games/game-engine.ts` ni `app/actions/scores.ts`. Si el plan
  los incluye, parar y preguntar.
- El motor no llama a `saveScore` ni conoce la sesión.
- Actualizar `references/juegos-implementados.md` al registrar el motor.

### Verificación end-to-end

Antes de pasar a la Fase 5, correr la sección **"Verificación end-to-end"**
de `.claude/skills/add-game-impl/SKILL.md` (lint + build, Playwright,
guardado real en Supabase, reflejo en rankings, aislamiento de chunks,
entrar/salir sin fugas). Si algo falla, arreglarlo dentro del alcance del
spec o reportarlo y **no** seguir con la Fase 5.

## Fase 5 — Cadena de agentes: skins → móvil (secuencial)

Solo se dispara cuando todos los pasos del plan están implementados y la
verificación pasó.

1. **Obtener el `game-id`:** la clave que el spec agregó (o modificó) en
   `GAME_ENGINES` de `components/games/registry.ts`. Confirmar que existe
   ahí antes de lanzar nada. Avisar al usuario: "Implementación completa.
   Lanzo `@skin-designer` y después `@mobile-porter` sobre `<game-id>`."
2. **`@skin-designer`** — una llamada a `Agent` con
   `subagent_type: "skin-designer"`, `description: "skin-designer <game-id>"`
   y un prompt con: el `game-id`, la ruta del spec, la branch activa, y la
   aclaración de que no toque git ni haga bumps de versión.
3. **Esperar a que termine.** Si corre en segundo plano, no hacer nada más
   hasta recibir su notificación — nunca predecir su resultado. Resumir su
   reporte etiquetado como **skin-designer**: skins agregadas, archivos
   tocados, observaciones. Si falló o reportó un bloqueo, **parar acá** y
   no lanzar `@mobile-porter`.
4. **`@mobile-porter`** — recién después, en un mensaje aparte, una llamada
   a `Agent` con `subagent_type: "mobile-porter"`,
   `description: "mobile-porter <game-id>"` y un prompt con: el `game-id`,
   la ruta del spec, la branch activa, el resumen de lo que acaba de hacer
   `@skin-designer` (ambos tocan `registry.ts` y el motor), y la aclaración
   de que no toque git ni haga bumps de versión.
5. Esperar igual y resumir su reporte etiquetado como **mobile-porter**:
   `touchControls` declarados, fixes de input, viewports verificados.

**Regla dura:** los dos agentes **nunca** en el mismo mensaje ni en
paralelo — editan los mismos archivos y el segundo tiene que partir del
resultado del primero.

## Fase 6 — Cierre

```
✅ Spec implementado, skins verificadas y juego portado a móvil.

skin-designer:  <resumen en una línea>
mobile-porter:  <resumen en una línea>

Siguiente paso: verificar los criterios de aceptación del spec uno por uno.
Si todos pasan, actualizá el estado del spec a "Implementado" y hacé el
commit final antes de mergear esta branch.
```

Ni este comando ni los agentes hacen commits ni tocan git más allá de la
branch de la Fase 3.
