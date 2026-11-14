-- 0000_baseline — estado del esquema `public` de Arcade Vault (spec 18)
--
-- Volcado del proyecto dev (fumwaikjxwrhnuyofdxq) el 2026-11-08. Reemplaza
-- sql/legacy/001–007 y las 10 migraciones registradas en dev hasta esa fecha.
--
-- Reglas de este archivo (y de toda migración en db/migrations/):
--   * Solo esquema y seguridad. Sin datos: el catálogo va en db/seeds/shared/.
--   * Idempotente: aplicarlo sobre una base que ya está en este estado no cambia nada.
--   * Sin `begin`/`commit`: el bundle de release lo envuelve en una transacción.
--   * Cuerpos de función con `$fn$`, nunca `$$` ni `$mig$` (los usa el bundle).
--   * Los cuerpos de función son copia LITERAL de dev: Postgres guarda el texto
--     tal cual y db/verify/post-deploy.sql compara su md5.
--
-- Los grants de tabla a anon/authenticated/service_role no se declaran: son los
-- default privileges de Supabase y se crean solos al crear la tabla. Lo que
-- protege los datos es RLS (ver references/security-checklist/politicas-rls.md).

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.games (
  id text primary key,
  title text not null,
  short text not null,
  long text not null,
  cat text not null check (cat in ('ARCADE', 'PUZZLE', 'SHOOTER', 'VERSUS')),
  cover text not null,
  color text not null check (color in ('cyan', 'magenta', 'yellow', 'green')),
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null references public.games (id),
  score integer not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

-- Usernames únicos sin distinguir mayúsculas (spec 15).
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));
-- Rankings por juego.
create index if not exists scores_game_id_score_idx on public.scores (game_id, score desc);
-- FK y "mis puntajes" (spec 16).
create index if not exists scores_user_id_idx on public.scores (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security y políticas
-- ---------------------------------------------------------------------------

alter table public.games enable row level security;
alter table public.profiles enable row level security;
alter table public.scores enable row level security;

-- games: solo lectura pública. Se modifica solo con service_role (seed).
drop policy if exists "games_select_public" on public.games;
create policy "games_select_public" on public.games
  for select using (true);

-- profiles: lectura pública; cada usuario edita solo el suyo.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- scores: lectura pública; cada usuario inserta solo los suyos.
drop policy if exists "Scores are viewable by everyone" on public.scores;
create policy "Scores are viewable by everyone" on public.scores
  for select using (true);

drop policy if exists "Users can insert their own scores" on public.scores;
create policy "Users can insert their own scores" on public.scores
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Funciones SECURITY DEFINER
-- ---------------------------------------------------------------------------

-- Crea la fila de profiles al registrarse (usuario propio o generado para OAuth).
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $fn$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  candidate := lower(new.raw_user_meta_data->>'username');
  IF candidate ~ '^[a-z0-9_]{3,16}$'
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE username = candidate) THEN
    INSERT INTO profiles (id, username) VALUES (new.id, candidate);
    RETURN new;
  END IF;

  base := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1),
    ''
  );
  base := left(regexp_replace(lower(base), '[^a-z0-9_]', '', 'g'), 12);
  IF length(base) < 3 THEN
    base := 'jugador';
  END IF;

  candidate := base;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate) LOOP
    n := n + 1;
    candidate := base || n;
  END LOOP;

  INSERT INTO profiles (id, username) VALUES (new.id, candidate);
  RETURN new;
END;
$fn$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Login con usuario: devuelve el email. Solo la llama el cliente admin (signIn).
create or replace function public.email_for_username(p_username text)
  returns text
  language sql
  security definer
  set search_path to 'public', 'auth'
as $fn$
  SELECT u.email
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE p.username = lower(p_username);
$fn$;

revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;

-- ---------------------------------------------------------------------------
-- Trigger de alta de usuarios
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
