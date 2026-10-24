-- SPEC 15 (code review): un username es único sin importar mayúsculas.
-- El registro y la búsqueda por usuario ya trabajan en minúsculas; el UNIQUE
-- de profiles.username distingue 'PX_Kai' de 'px_kai'. Este índice cierra
-- ese hueco a nivel base (al crearlo, ningún perfil tenía mayúsculas).
CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles (lower(username));
