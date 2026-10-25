## Checklist de seguridad básico

> Implementado en el spec [16](../../specs/16-endurecimiento-seguridad-rutas-v0.7.0.md) (v0.7.0, 2026-10-25). Inventario de políticas: [`politicas-rls.md`](politicas-rls.md).
> Auditoría periódica: [`@security-guardian`](../../.claude/agents/security-guardian.md) (completo o `diff`), solo reporta; reportes en [`auditorias/`](auditorias/).

- [x] RLS: Row Level Security habilitado en ambas tablas: `games` y `scores` — también en `profiles`. Políticas de escritura con `(select auth.uid())` y rol `authenticated` (`sql/007_endurecimiento_rls.sql`).
- [x] Minimum password length — mínimo 8 caracteres (Supabase Auth + `MIN_PASSWORD` en `app/actions/auth.ts`). Además, Supabase exige minúsculas, mayúsculas y dígitos.
- [x] Leaked password protection — el toggle de Supabase es solo del plan Pro (proyecto en Free): **cubierto en la app** con la API Pwned Passwords de HaveIBeenPwned (`lib/pwned-password.ts`, k-anonymity, fail-open) en registro y restablecer contraseña. El advisor `auth_leaked_password_protection` sigue en WARN por eso.
- [x] Max signup rate — 10 por IP (Supabase Auth → Rate Limits, ventana de 5 min).
- [x] Headers de seguridad en Next.js — `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security` (sin `preload`, solo en producción).
- [x] _(Agregado)_ Protección de rutas con `proxy.ts`: jugar (`/juegos/<id>/jugar`) requiere sesión; segunda línea en la página.

Ej. (referencia original):

```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

// En la config de Next.js:
headers: async () => [
  { source: '/(.*)', headers: securityHeaders }
]
```

## Por el lado de Supabase (advisors)

| Lint | Nivel | Estado |
|---|---|---|
| `auth_leaked_password_protection` | WARN · SECURITY | ⚠️ Sigue: requiere plan Pro. Cubierto en la app (ver arriba). |
| `auth_rls_initplan` — `profiles` "Users can update their own profile" | WARN · PERFORMANCE | ✅ Resuelto (`sql/007`). |
| `auth_rls_initplan` — `scores` "Users can insert their own scores" | WARN · PERFORMANCE | ✅ Resuelto (`sql/007`). |
| `unindexed_foreign_keys` — `scores.user_id` | INFO · PERFORMANCE | ✅ Resuelto (`scores_user_id_idx`, `sql/007`). |

Pendientes para specs futuros: Content-Security-Policy, `preload` de HSTS, captcha, auditoría de funciones `SECURITY DEFINER` y de grants (ver `politicas-rls.md`).
