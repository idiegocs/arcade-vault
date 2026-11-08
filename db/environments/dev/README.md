# Ambiente dev

|                     |                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Proyecto Supabase   | `fumwaikjxwrhnuyofdxq`                                                                                              |
| API URL             | `https://fumwaikjxwrhnuyofdxq.supabase.co`                                                                          |
| Sitio               | `http://localhost:3000` (y `http://192.168.x.x:3000` desde el celular, ver `allowedDevOrigins` en `next.config.ts`) |
| Acceso a la base    | **MCP de Supabase** (`.mcp.json` apunta a este proyecto), SQL Editor del dashboard                                  |
| Variables de la app | `.env.development.local` en la raíz (ver [`.env.example`](.env.example))                                            |
| Config de Auth      | [`auth-config.md`](auth-config.md)                                                                                  |

Datos que **solo existen acá**: los usuarios de prueba (incluida la cuenta E2E `E2E_USER_*` de las auditorías), sus perfiles y sus scores. No se migran a prod.

## Cómo se aplica un cambio de base en dev

1. Escribir la migración en `db/migrations/000N_<slug>.sql` o el cambio de catálogo en `db/seeds/shared/games.sql`. Las reglas están en [`db/README.md`](../../README.md).
2. Aplicarla con MCP:
   - migración: `apply_migration` con `name = "000N_<slug>"` y el contenido del archivo. Después, registrarla en el ledger:

     ```sql
     insert into ops.migration_log (version, checksum)
     values ('000N_<slug>', '<sha256 que imprime npm run db:release>')
     on conflict (version) do nothing;
     ```

   - seed: `execute_sql` con el contenido de `db/seeds/shared/games.sql` (es upsert).
3. Correr [`db/verify/post-deploy.sql`](../../verify/post-deploy.sql) y guardar la **huella**: es la que prod tiene que reproducir.
4. Probar la app (`npm run dev`).

Los agentes (`/add-game-impl`, `@security-guardian`, etc.) trabajan **solo** contra este proyecto.

## Datos de prueba opcionales

[`seeds/`](seeds/) es para datos que solo tienen sentido en dev (por ejemplo, scores para ver un ranking poblado). Hoy está vacío. Si se agrega algo, nunca entra en un release de prod: `build-prod-release.mjs` solo toma `db/migrations/` y `db/seeds/shared/`.
