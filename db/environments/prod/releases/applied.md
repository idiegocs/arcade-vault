# Releases aplicados en prod

Registro de qué archivo de este directorio se pegó en el SQL Editor de prod. Se agrega **una fila por release, después de correr `db/verify/post-deploy.sql`**. La última fila es la que se pasa como `--from` al próximo `npm run db:release`. También se puede leer directo del ledger de prod: `select version from ops.migration_log order by version desc limit 1;`.

## Huella esperada

Es la fila `huella` de `db/verify/post-deploy.sql` en dev después de aplicar el último release. Prod tiene que dar **el mismo valor**.

| Después de              | Huella (dev)                       | Medida     |
| ----------------------- | ---------------------------------- | ---------- |
| `2026-11-08_v0.8.0.sql` | `f6c204ba1abb83f58be5f6e3bcf2e7ea` | 2026-11-08 |

## Aplicados

| Release                 | Migraciones incluidas | Aplicado    | Por | Huella prod = dev | Notas                                                   |
| ----------------------- | --------------------- | ----------- | --- | ----------------- | ------------------------------------------------------- |
| `2026-11-08_v0.8.0.sql` | `0000_baseline`       | _pendiente_ |     |                   | Primer release: ledger + baseline + catálogo (8 juegos) |
