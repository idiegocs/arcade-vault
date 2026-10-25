-- SPEC 16: endurecimiento de RLS (advisors de Supabase).
-- auth_rls_initplan: (select auth.uid()) se evalúa una vez por query, no por fila.
-- Las políticas de escritura pasan de `public` a `authenticated` y el UPDATE de
-- profiles gana un WITH CHECK explícito. Las de SELECT público no cambian.

-- 1) scores: INSERT solo del propio usuario autenticado
DROP POLICY IF EXISTS "Users can insert their own scores" ON public.scores;
CREATE POLICY "Users can insert their own scores"
  ON public.scores FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 2) profiles: UPDATE solo del propio perfil
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- 3) índice para la FK scores.user_id (advisor unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS scores_user_id_idx ON public.scores (user_id);
