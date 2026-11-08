#!/usr/bin/env node
// Genera el script SQL para pegar en el SQL Editor de PROD (spec 18).
//
//   npm run db:release                     → primer release (todas las migraciones)
//   npm run db:release -- --from 0000_baseline
//                                          → solo las migraciones posteriores a esa
//   npm run db:release -- --stdout         → imprime el bundle sin escribir archivo
//   npm run db:release -- --force          → sobrescribe el release del día si ya existe
//
// Salida: db/environments/prod/releases/<YYYY-MM-DD>_v<package.json version>.sql
// Contenido: begin; ledger ops.migration_log; cada migración pendiente dentro de un
// `do $mig$` que solo corre si su versión no está en el ledger; todos los seeds de
// db/seeds/shared/ (upserts); commit;
//
// Validaciones (cualquiera falla → no se escribe nada):
//   * ninguna migración usa `$mig$` ni tiene begin/commit propios;
//   * una migración ya publicada en un release anterior no cambió su checksum;
//   * todo id de components/games/registry.ts está en db/seeds/shared/games.sql.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");
const SEEDS_DIR = join(ROOT, "db", "seeds", "shared");
const RELEASES_DIR = join(ROOT, "db", "environments", "prod", "releases");
const REGISTRY = join(ROOT, "components", "games", "registry.ts");

const MIGRATION_RE = /^(\d{4})_[a-z0-9_-]+\.sql$/;
const HEADER_RE = /^-- migración: (\S+) sha256: ([0-9a-f]{64})$/gm;

function fail(message) {
  console.error(`✘ db:release — ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { from: null, stdout: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from")
      args.from = argv[++i] ?? fail("--from necesita una versión (ej. 0000_baseline)");
    else if (a === "--stdout") args.stdout = true;
    else if (a === "--force") args.force = true;
    else fail(`argumento desconocido: ${a}`);
  }
  return args;
}

/** Lee un .sql normalizado a LF (Postgres guarda el texto de las funciones tal cual). */
function readSql(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
}

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function validateSql(name, sql) {
  // Se valida el código sin comentarios `--` (los comentarios pueden nombrar $mig$).
  const code = sql.replace(/--.*$/gm, "");
  if (code.includes("$mig$")) fail(`${name} usa $mig$ (reservado para el bundle). Usar $fn$.`);
  if (/^\s*(begin|commit|rollback)\s*;/im.test(code)) {
    fail(`${name} tiene begin/commit/rollback propios: el bundle ya es una transacción.`);
  }
}

function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const bad = files.filter((f) => !MIGRATION_RE.test(f));
  if (bad.length) fail(`nombres de migración inválidos (NNNN_slug.sql): ${bad.join(", ")}`);
  const numbers = files.map((f) => f.slice(0, 4));
  const dup = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (dup) fail(`número de migración repetido: ${dup}`);

  return files.map((file) => {
    const sql = readSql(join(MIGRATIONS_DIR, file));
    validateSql(`db/migrations/${file}`, sql);
    return { version: file.replace(/\.sql$/, ""), file, sql, checksum: sha256(sql) };
  });
}

function loadSeeds() {
  if (!existsSync(SEEDS_DIR)) return [];
  return readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => {
      const sql = readSql(join(SEEDS_DIR, file));
      validateSql(`db/seeds/shared/${file}`, sql);
      return { file, sql };
    });
}

/** Checksums de migraciones ya publicadas, leídos de los headers de releases anteriores. */
function publishedChecksums() {
  const published = new Map();
  if (!existsSync(RELEASES_DIR)) return published;
  for (const file of readdirSync(RELEASES_DIR).filter((f) => f.endsWith(".sql"))) {
    const text = readFileSync(join(RELEASES_DIR, file), "utf8");
    for (const [, version, checksum] of text.matchAll(HEADER_RE)) {
      published.set(version, { checksum, release: file });
    }
  }
  return published;
}

function checkRegistryInSeed(seeds) {
  const games = seeds.find((s) => s.file === "games.sql");
  if (!games) fail("falta db/seeds/shared/games.sql");
  const seedIds = new Set([...games.sql.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]));
  const registry = readFileSync(REGISTRY, "utf8");
  // Claves de primer nivel del objeto del registry: exactamente 2 espacios de indentación.
  const registryIds = [...registry.matchAll(/^ {2}"?([a-z0-9-]+)"?: \{$/gm)].map((m) => m[1]);
  if (registryIds.length === 0) fail("no se encontraron ids en components/games/registry.ts");
  const missing = registryIds.filter((id) => !seedIds.has(id));
  if (missing.length) {
    fail(`ids de registry.ts que faltan en db/seeds/shared/games.sql: ${missing.join(", ")}`);
  }
  return { registryIds, seedIds };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildBundle({ version, date, pending, seeds, from }) {
  const header = [
    `-- Arcade Vault — release v${version} para PROD (${date})`,
    "-- GENERADO por scripts/build-prod-release.mjs — no editar a mano.",
    "--",
    "-- Cómo aplicarlo: copiar TODO este archivo → SQL Editor del proyecto de prod → Run.",
    "-- Es una sola transacción: si algo falla no queda nada aplicado. Pegarlo dos veces",
    "-- no hace nada la segunda (el ledger ops.migration_log saltea lo ya aplicado).",
    "-- Después: correr db/verify/post-deploy.sql y registrar en releases/applied.md.",
    "--",
    `-- Desde: ${from ?? "(primer release)"}`,
    ...pending.map((m) => `-- migración: ${m.version} sha256: ${m.checksum}`),
    ...seeds.map((s) => `-- seed: db/seeds/shared/${s.file}`),
    "",
  ];

  const ledger = `begin;

-- Ledger de migraciones (schema ops: no lo expone la API de Supabase).
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.migration_log (
  version text primary key,
  applied_at timestamptz not null default now(),
  checksum text not null
);
revoke all on ops.migration_log from public, anon, authenticated;
`;

  const migrations = pending.map(
    (m) => `
-- ===========================================================================
-- Migración ${m.version} (db/migrations/${m.file})
-- ===========================================================================
do $mig$
begin
  if exists (select 1 from ops.migration_log where version = '${m.version}') then
    raise notice 'migración ${m.version}: ya aplicada, se saltea';
    return;
  end if;

${m.sql}
  insert into ops.migration_log (version, checksum) values ('${m.version}', '${m.checksum}');
  raise notice 'migración ${m.version}: aplicada';
end
$mig$;
`
  );

  const seedBlocks = seeds.map(
    (s) => `
-- ===========================================================================
-- Seed compartido db/seeds/shared/${s.file} (upsert: siempre se aplica)
-- ===========================================================================
${s.sql}`
  );

  return `${header.join("\n")}\n${ledger}${migrations.join("")}${seedBlocks.join("")}\ncommit;\n`;
}

// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const migrations = loadMigrations();
const seeds = loadSeeds();

const published = publishedChecksums();
for (const m of migrations) {
  const prev = published.get(m.version);
  if (prev && prev.checksum !== m.checksum) {
    fail(
      `${m.file} cambió después de publicarse en ${prev.release}. ` +
        "Una migración publicada no se edita: crear una nueva."
    );
  }
}

if (args.from && !migrations.some((m) => m.version === args.from)) {
  fail(`--from ${args.from} no existe en db/migrations/`);
}
const pending = args.from ? migrations.filter((m) => m.version > args.from) : migrations;
const { registryIds, seedIds } = checkRegistryInSeed(seeds);

const date = today();
const bundle = buildBundle({ version, date, pending, seeds, from: args.from });

if (args.stdout) {
  process.stdout.write(bundle);
  process.exit(0);
}

const out = join(RELEASES_DIR, `${date}_v${version}.sql`);
if (existsSync(out) && !args.force) {
  fail(
    `${relative(ROOT, out).replace(/\\/g, "/")} ya existe. Usar --force para regenerarlo (solo si todavía no se pegó en prod).`
  );
}
mkdirSync(RELEASES_DIR, { recursive: true });
writeFileSync(out, bundle, "utf8");

console.log(`✔ ${relative(ROOT, out).replace(/\\/g, "/")}`);
console.log(
  `  migraciones: ${pending.length ? pending.map((m) => m.version).join(", ") : "(ninguna pendiente)"}`
);
console.log(
  `  seeds: ${seeds.map((s) => s.file).join(", ")} — ${seedIds.size} juegos (registry: ${registryIds.length}, todos presentes)`
);
console.log(
  "  siguiente: pegarlo en el SQL Editor de prod → db/verify/post-deploy.sql → releases/applied.md"
);
