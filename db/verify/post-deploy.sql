-- Verificación post-deploy — COMÚN a todos los ambientes (spec 18)
--
-- Uso: pegar en el SQL Editor (prod) o correr con MCP execute_sql (dev) y
-- comparar la salida entre ambientes. Es una sola consulta de solo lectura.
--
-- Cómo leerla:
--   * Fila `huella` (la primera): md5 de todo lo que tiene que ser IGUAL en todos
--     los ambientes (esquema, seguridad, catálogo, ledger). Si coincide entre dev
--     y prod, listo. Si no, comparar las demás filas sección por sección.
--   * Sección `datos_ambiente`: conteos propios de cada ambiente (usuarios,
--     scores). NO entran en la huella y se espera que difieran.
--   * El ledger se muestra sin `applied_at` (la fecha difiere por ambiente).

with checks(seccion, objeto, detalle) as (
  -- Tablas y columnas de public
  select 'columnas', c.table_name || '.' || c.column_name,
         concat_ws(' ', c.data_type, case when c.is_nullable = 'NO' then 'not null' end,
                   'default=' || c.column_default,
                   case when c.is_identity = 'YES' then 'identity ' || c.identity_generation end)
  from information_schema.columns c
  where c.table_schema = 'public'

  union all -- Constraints (PK, FK, unique, check)
  select 'constraints', con.conrelid::regclass::text || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con
  where con.connamespace = 'public'::regnamespace

  union all -- Índices
  select 'indices', i.indexname, i.indexdef
  from pg_indexes i
  where i.schemaname = 'public'

  union all -- RLS activo por tabla
  select 'rls', cl.relname, 'enabled=' || cl.relrowsecurity || ' forced=' || cl.relforcerowsecurity
  from pg_class cl
  where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r'

  union all -- Políticas
  select 'politicas', p.tablename || '.' || p.policyname,
         concat_ws(' | ', p.cmd, p.roles::text, 'using=' || p.qual, 'check=' || p.with_check)
  from pg_policies p
  where p.schemaname = 'public'

  union all -- Funciones: md5 de la definición completa (cuerpo, security definer, search_path)
  select 'funciones', pr.oid::regprocedure::text, md5(pg_get_functiondef(pr.oid))
  from pg_proc pr
  where pr.pronamespace = 'public'::regnamespace

  union all -- Quién puede ejecutar cada función
  select 'funciones_execute', rp.routine_name,
         string_agg(rp.grantee, ',' order by rp.grantee)
  from information_schema.routine_privileges rp
  where rp.routine_schema = 'public' and rp.privilege_type = 'EXECUTE'
  group by rp.routine_name

  union all -- Triggers de public y de auth.users
  select 'triggers', t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class cl on cl.oid = t.tgrelid
  where not t.tgisinternal and cl.relnamespace in ('public'::regnamespace, 'auth'::regnamespace)

  union all -- Catálogo: una fila por juego, md5 del contenido
  select 'games', g.id,
         g.sort_order || ' ' || md5(concat_ws('|', g.title, g.short, g.long, g.cat, g.cover, g.color))
  from public.games g

  union all -- Ledger (si existe): versión + checksum, sin fecha
  select 'ledger',
         (xpath('version/text()', r))[1]::text,
         (xpath('checksum/text()', r))[1]::text
  from unnest(xpath('/table/row',
         case when to_regclass('ops.migration_log') is null then '<table/>'::xml
              else query_to_xml('select version, checksum from ops.migration_log', false, false, '')
         end)) as r
),
huella as (
  select md5(string_agg(seccion || '|' || objeto || '|' || coalesce(detalle, ''),
                        E'\n' order by seccion, objeto)) as md5
  from checks
),
ambiente(seccion, objeto, detalle) as (
  select 'datos_ambiente', 'auth.users', count(*)::text from auth.users
  union all select 'datos_ambiente', 'public.profiles', count(*)::text from public.profiles
  union all select 'datos_ambiente', 'public.scores', count(*)::text from public.scores
)
select seccion, objeto, detalle
from (
  select 0 as orden, 'huella' as seccion, 'esquema+seguridad+catalogo+ledger' as objeto, md5 as detalle from huella
  union all select 1, seccion, objeto, detalle from checks
  union all select 2, seccion, objeto, detalle from ambiente
) salida
order by orden, seccion, objeto;
