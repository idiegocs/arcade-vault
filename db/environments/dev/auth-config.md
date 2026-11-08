# Auth de dev — configuración del dashboard

Proyecto `fumwaikjxwrhnuyofdxq`. Estos valores **no** están en SQL: se configuran a mano en el dashboard de Supabase y en las consolas de Google y GitHub. Origen: spec 15 (anexo), spec 16 (paso 4) y spec 17 (Confirm email).

## Supabase → Authentication

| Ajuste                         | Dónde                                         | Valor dev                                                                      |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Site URL                       | URL Configuration                             | `http://localhost:3000`                                                        |
| Redirect URLs                  | URL Configuration                             | `http://localhost:3000/auth/callback`                                          |
| Confirm email                  | Providers → Email                             | **Activado** (spec 17: el registro no revela qué correos tienen cuenta)        |
| Contraseña mínima              | Providers → Email → _Minimum password length_ | 8                                                                              |
| Requisitos de composición      | Providers → Email → _Password requirements_   | minúsculas, mayúsculas y dígitos                                               |
| Leaked password protection     | Providers → Email                             | No disponible en plan Free. Lo cubre la app (`lib/pwned-password.ts`)          |
| Rate limit de signups/sign-ins | Rate Limits                                   | 10 por IP (ventana de 5 min)                                                   |
| SMTP                           | Emails → SMTP Settings                        | El SMTP por defecto de Supabase (solo para pruebas, con límite bajo de envíos) |

## Proveedores OAuth (apps propias de dev)

| Proveedor | Consola                                         | Valores                                                                                                      |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Google    | Google Cloud → Credentials → OAuth client (Web) | JS origin `http://localhost:3000` · redirect URI `https://fumwaikjxwrhnuyofdxq.supabase.co/auth/v1/callback` |
| GitHub    | Settings → Developer settings → OAuth Apps      | Homepage `http://localhost:3000` · callback `https://fumwaikjxwrhnuyofdxq.supabase.co/auth/v1/callback`      |

El Client ID y el secret de cada app se cargan en Supabase → Authentication → Providers. **No** se reusan en prod: prod tiene sus propias apps, ver [`../prod/auth-config.md`](../prod/auth-config.md).
