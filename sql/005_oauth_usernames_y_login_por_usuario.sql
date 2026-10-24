-- SPEC 15: usernames para cuentas OAuth (Google/GitHub) y login por usuario.

-- 1) handle_new_user(): username propio (email/contraseña) o generado (OAuth).
--    Antes copiaba raw_user_meta_data->>'username' tal cual; OAuth no lo manda
--    y el NOT NULL de profiles.username hacía fallar el registro.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  -- Registro con email/contraseña: el username ya viene validado por signUp
  -- (3–16 caracteres) y se guarda tal cual, sin recortar.
  candidate := lower(new.raw_user_meta_data->>'username');
  IF candidate ~ '^[a-z0-9_]{3,16}$'
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE username = candidate) THEN
    INSERT INTO profiles (id, username) VALUES (new.id, candidate);
    RETURN new;
  END IF;

  -- OAuth (o username inválido/tomado): se genera uno a partir de los datos
  -- del proveedor, recortado a 12 para dejar lugar al sufijo numérico.
  base := coalesce(
    new.raw_user_meta_data->>'username',    -- registro con email/contraseña
    new.raw_user_meta_data->>'user_name',   -- GitHub
    split_part(new.email, '@', 1),          -- Google
    ''                                      -- sin email ni user_name
  );
  base := left(regexp_replace(lower(base), '[^a-z0-9_]', '', 'g'), 12);
  IF length(base) < 3 THEN
    base := 'jugador';
  END IF;

  candidate := base;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate) LOOP
    n := n + 1;
    candidate := base || n;                 -- px_kai → px_kai1, px_kai2…
  END LOOP;

  INSERT INTO profiles (id, username) VALUES (new.id, candidate);
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- 2) usuario → email, solo para service_role (cliente admin del servidor).
--    Ejecutable por anon expondría el email de cualquier jugador.
CREATE FUNCTION public.email_for_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT u.email
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE p.username = lower(p_username);
$$;

REVOKE EXECUTE ON FUNCTION public.email_for_username(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO service_role;
