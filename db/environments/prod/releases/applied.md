# Releases aplicados en prod

Registro de qué archivo de este directorio se pegó en el SQL Editor de prod. Se agrega **una fila por release, después de correr `db/verify/post-deploy.sql`**. La última fila es la que se pasa como `--from` al próximo `npm run db:release`. También se puede leer directo del ledger de prod: `select version from ops.migration_log order by version desc limit 1;`.

| Release | Migraciones incluidas | Aplicado | Por | Huella prod = dev | Notas |
| ------- | --------------------- | -------- | --- | ----------------- | ----- |
|         |                       |          |     |                   |       |
