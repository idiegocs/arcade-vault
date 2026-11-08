# Ambiente prod

|                     |                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Proyecto Supabase   | `<ref-prod>` (completar)                                                                                  |
| API URL             | `https://<ref-prod>.supabase.co`                                                                          |
| Sitio               | `https://<dominio-prod>` (completar)                                                                      |
| Acceso a la base    | **Solo SQL Editor del dashboard.** Sin CLI, sin MCP, sin connection string para agentes                   |
| Variables de la app | Env vars del hosting (o `.env.production.local` si el build es local). Ver [`.env.example`](.env.example) |
| Config de Auth      | [`auth-config.md`](auth-config.md)                                                                        |
| Qué está aplicado   | [`releases/applied.md`](releases/applied.md)                                                              |

## Reglas

- **Ningún agente ni MCP apunta a prod.** `.mcp.json` es de dev. No se agrega un server de prod.
- **La base de prod cambia solo por un release:** un archivo generado en [`releases/`](releases/). No se escribe SQL suelto en el SQL Editor (salvo `db/verify/post-deploy.sql`, que es de solo lectura).
- **No se copia nada específico de dev:** ni usuarios, ni scores, ni keys, ni apps OAuth.
- Los datos propios de prod (usuarios, perfiles, scores) nunca vuelven a dev ni al repo.

## Cómo se pasa un cambio a prod

1. En el repo, con el cambio ya aplicado y probado en dev:

   ```bash
   npm run db:release -- --from <última versión de applied.md>
   ```

   En el primer pase va sin `--from`. Genera `releases/<YYYY-MM-DD>_v<versión>.sql`.

2. Abrir ese archivo, copiar **todo**, pegarlo en el SQL Editor del proyecto `<ref-prod>` y darle **Run**. Es una sola transacción: si algo falla, no se aplica nada y se puede corregir y volver a pegar.
3. Pegar [`db/verify/post-deploy.sql`](../../verify/post-deploy.sql) y darle Run. La fila `huella` tiene que ser **igual** a la de dev. Si no coincide, comparar sección por sección.
4. Agregar una fila en [`releases/applied.md`](releases/applied.md) y commitear.
5. Si el release cambia algo de Auth o de variables, completar [`auth-config.md`](auth-config.md) y las env vars del hosting antes de desplegar la app.

Orden con la app: **primero la base, después la app.** Las migraciones tienen que ser compatibles con la versión de la app que ya está corriendo.
