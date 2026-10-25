# Políticas RLS de Arcade Vault

Inventario de Row Level Security del esquema `public` en Supabase. **Todo cambio de políticas, RLS, funciones `SECURITY DEFINER` o grants se refleja acá** en el mismo spec/PR que lo introduce.

> **Generado:** 2026-10-25, desde la base (no a mano), después de la migración `sql/007_endurecimiento_rls.sql` — spec [16](../../specs/16-endurecimiento-seguridad-rutas-v0.7.0.md). Para regenerarlo, ver [Cómo regenerar](#cómo-regenerar).

## Resumen

| Tabla | RLS | `FORCE` RLS | Lectura | Escritura desde el cliente |
|---|---|---|---|---|
| `games` | ✅ | no | pública | **ninguna** |
| `scores` | ✅ | no | pública | INSERT del propio usuario autenticado |
| `profiles` | ✅ | no | pública | UPDATE del propio perfil (usuario autenticado) |

Roles de Supabase: `anon` = sin sesión (publishable key), `authenticated` = con sesión, `service_role` = secret key (servidor; **salta RLS**). `{public}` en una política = todos los roles.

Con RLS activo, **lo que no está permitido por una política está denegado**. Por eso las tablas de abajo listan también lo que no se puede hacer.

## `games` — catálogo

| Política | Comando | Roles | `USING` | `WITH CHECK` | Definida en |
|---|---|---|---|---|---|
| `games_select_public` | SELECT | `{public}` | `true` | — | `sql/004_recreate_games_table.sql` |

- **Permite:** que cualquiera (con o sin sesión) lea el catálogo: `/`, `/games`, fichas, Salón de la Fama.
- **No permite:** INSERT, UPDATE ni DELETE desde el cliente, a ningún rol. El catálogo solo se modifica con `service_role` (MCP de Supabase / SQL), como hacen `/add-game` y `/add-game-impl`.

## `scores` — puntajes

| Política | Comando | Roles | `USING` | `WITH CHECK` | Definida en |
|---|---|---|---|---|---|
| `Scores are viewable by everyone` | SELECT | `{public}` | `true` | — | `sql/003_create_scores.sql` |
| `Users can insert their own scores` | INSERT | `{authenticated}` | — | `((SELECT auth.uid()) = user_id)` | `sql/003` → recreada en `sql/007` |

- **Permite:** leer todos los puntajes (rankings públicos); que un usuario con sesión inserte un puntaje **a su nombre** (`user_id` = su propio id).
- **No permite:**
  - insertar sin sesión (`anon` no tiene política de INSERT → `42501`);
  - insertar a nombre de otro usuario (`WITH CHECK` falla → `42501`);
  - **UPDATE ni DELETE** a nadie desde el cliente: un puntaje guardado no se puede editar ni borrar.
- **Fuera de RLS:** el techo de puntaje plausible lo valida `saveScore` (`app/actions/scores.ts`, spec 11) antes del INSERT; RLS solo garantiza el dueño.
- `(SELECT auth.uid())` se evalúa una vez por query y no por fila (advisor `auth_rls_initplan`, spec 16).

## `profiles` — usuarios públicos

| Política | Comando | Roles | `USING` | `WITH CHECK` | Definida en |
|---|---|---|---|---|---|
| `Profiles are viewable by everyone` | SELECT | `{public}` | `true` | — | `sql/002_create_profiles.sql` |
| `Users can update their own profile` | UPDATE | `{authenticated}` | `((SELECT auth.uid()) = id)` | `((SELECT auth.uid()) = id)` | `sql/002` → recreada en `sql/007` |

- **Permite:** leer todos los perfiles (usernames en rankings y Nav); que un usuario con sesión actualice **su** fila.
- **No permite:**
  - actualizar el perfil de otro (`USING` no encuentra la fila);
  - cambiar el `id` de su propia fila a otro usuario (`WITH CHECK`);
  - **INSERT ni DELETE** desde el cliente: el perfil lo crea el trigger `on_auth_user_created` y se borra en cascada con `auth.users`.
- **Ojo:** la política no restringe **columnas**. Un usuario con sesión podría cambiar su `username` llamando a la API directamente, sin pasar por la validación de `signUp` (`^[a-z0-9_]{3,16}$`). Lo frenan el `UNIQUE` y el índice `profiles_username_lower_key` (`sql/006`), pero no el formato. Hoy la app no tiene pantalla para cambiarlo (spec 15, fuera de alcance).

## Funciones que saltan RLS (`SECURITY DEFINER`)

Corren con los permisos de su dueño (`postgres`), así que **no las limita RLS**. Solo listadas: su auditoría completa quedó fuera del spec 16.

| Función | `search_path` | `EXECUTE` | Uso | Definida en |
|---|---|---|---|---|
| `handle_new_user()` | `public` | `postgres`, `service_role` (revocada a `public`/`anon`/`authenticated`) | Trigger `on_auth_user_created` en `auth.users`: crea la fila de `profiles` (username propio o generado para OAuth). | `sql/002` → reemplazada en `sql/005` |
| `email_for_username(p_username text)` | `public, auth` | `postgres`, `service_role` | Login con usuario: la llama `signIn` con el cliente admin (`lib/supabase/admin.ts`). | `sql/005` |

## Grants de tabla

`anon` y `authenticated` tienen en las 3 tablas los grants por defecto de Supabase (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`). **No son los que protegen los datos**: con RLS activo, lo que decide es la política. `TRUNCATE` no está sujeto a RLS, pero la API de Supabase (PostgREST) no lo expone. Revocar los grants sobrantes queda para la auditoría de grants (fuera del spec 16).

## Cómo regenerar

Con el MCP de Supabase (`execute_sql`):

```sql
-- RLS por tabla
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- Políticas
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- Funciones SECURITY DEFINER y quién puede ejecutarlas
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.proconfig,
       (select string_agg(distinct grantee, ',') from information_schema.routine_privileges rp
         where rp.specific_name = p.proname || '_' || p.oid and rp.privilege_type = 'EXECUTE') as execute_grants
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;

-- Grants de tabla a anon / authenticated
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee;
```

Después de cambiar algo, correr también `get_advisors` (security y performance).
