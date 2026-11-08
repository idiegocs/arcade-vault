# `sql/` — histórico (no usar)

Desde el spec 18 (v0.8.0), el SQL de la base vive en [`db/`](../db/):

- Esquema y seguridad: `db/migrations/` (arranca en `0000_baseline.sql`).
- Catálogo de juegos: `db/seeds/shared/games.sql`.
- Pasar a prod: `db/README.md`.

`sql/legacy/001–007` son los scripts originales de los specs 04–16, y se conservan solo como referencia histórica. Los specs viejos y las auditorías los citan. **No los apliques en ningún ambiente:** `004` dropea y recrea `games`, y `0000_baseline.sql` ya describe su estado final.
