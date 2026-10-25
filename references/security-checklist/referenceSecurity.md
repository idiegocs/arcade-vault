## Checklist de seguridad básico

  - [ ] RLS: Row Level Security habilitado en ambas tablas: `games` y `scores`
  - [ ] Minimum password length — mínimo 8 caracteres
  - [ ] Leaked password protection — (el warning 4)
  - [ ] Max signup rate — limitar signups por IP (anti-bot)
  - [ ] Headers de seguridad en Next.js
  
  Ej:

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

## Por el ladod e Supabase:

- [ ] 
| auth_leaked_password_protection | Leaked Password Protection Disabled | WARN  | EXTERNAL | ["SECURITY"] | Leaked password protection is currently disabled. | Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security. | https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection | {"entity":"Auth","type":"auth"} | auth_leaked_password_protection |

                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \\`current_setting()\\` and \\`auth.<function>()\\` in RLS policies are being unnecessarily re-evaluated for each row | Table \\`public.profiles\\` has a row level security policy \\`Users can update their own profile\\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \\`auth.<function>()\\` with \\`(select auth.<function>())\\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info. | https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan | {"schema":"public","name":"profiles","type":"table"} | auth_rls_init_plan_public_profiles_Users can update their own profile | 2026-10-25T12:24:26.334Z |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \\`current_setting()\\` and \\`auth.<function>()\\` in RLS policies are being unnecessarily re-evaluated for each row | Table \\`public.scores\\` has a row level security policy \\`Users can insert their own scores\\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \\`auth.<function>()\\` with \\`(select auth.<function>())\\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.    | https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan | {"schema":"public","name":"scores","type":"table"}   | auth_rls_init_plan_public_scores_Users can insert their own scores    | 2026-10-25T12:24:26.334Z |