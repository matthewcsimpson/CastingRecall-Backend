# CLAUDE.md

Conventions for the Casting ReCall API. These describe how this codebase is
already written — follow them when adding or changing code.

## Stack & runtime

- Node.js **24.x** (`engines.node`), **Express 5**, **CommonJS** (`require` /
  `module.exports` — no ESM, no TypeScript).
- PostgreSQL via `pg`. Deployed on Heroku.
- Data source: The Movie Database (TMDB) over `axios`.

## Commands

- `npm start` — run the server (`node index.js`).
- `npm run dev` — run with nodemon.
- `npm test` — run the full suite (`node --test`).
- `npm run migrate` — apply SQL migrations.
- `npm run seed` — seed the DB from `data/*.json`.

## Architecture & layering

Requests flow `routes/ → controllers/ → repositories/ → utilities/`. Keep the
layers separate:

- **routes/** — wire method + path to a controller. No logic.
- **controllers/** — thin: read/validate the request, call a repository or
  utility, format the response. Catch errors here and map them to status
  codes. Controllers never write SQL.
- **repositories/** — own all SQL. Every query is parameterized (`$1`, `$2`);
  never interpolate user input into SQL. Map DB rows to plain objects before
  returning. Repositories never touch `req` / `res`.
- **utilities/** — pure-ish helpers (puzzle generation, formatting, filters,
  number/random helpers, the DB pool, the TMDB client, the logger).

## Module style

- Small modules of arrow functions, exported via a single `module.exports`
  object at the bottom.
- JSDoc on exported / non-trivial functions (params, return type, and
  `@typedef`s for shared shapes).

## Configuration

- All config comes from environment variables (`.env` locally, loaded with
  `require("dotenv").config({ quiet: true })`). `.env` is gitignored — never
  commit secrets.
- Read **numeric** env vars through `parseNumberWithDefault` /
  `parseIntWithDefault` (`utilities/numberUtils.js`) with an explicit fallback,
  not bare `process.env` coercion.

## Errors

- External/TMDB failures use `createExternalServiceError` (`utilities/tmdbClient.js`),
  which sets `isExternalServiceError` and `statusCode: 502`. Controllers map
  `isExternalServiceError` to 502 and everything else to 500.
- Don't `throw new Error(...)` in request paths — use the typed helper or let
  the controller's catch handle it.

## Logging

- Use `utilities/logger.js` (`logger.info` / `logger.warn` / `logger.error`),
  not `console.*`. Pass a message and an optional structured context object:
  `logger.error("getPuzzleById failed", { error: err })`. Errors are
  serialized with message + stack.

## Database & migrations

- The pool lives in `utilities/db.js`. In production, TLS verification is off
  by default (Heroku's self-signed cert); set `DATABASE_CA` to verify the
  chain properly.
- Migrations are plain SQL in `migrations/`, applied in filename order by
  `scripts/runMigration.js` and tracked in `schema_migrations`. **Migrations
  are immutable once applied** — never edit an applied file; add a new
  forward migration. Each migration runs in one transaction, so statements
  that can't run in a transaction block (e.g. `CREATE INDEX CONCURRENTLY`) are
  not supported by the current runner.

## Tests

- `node:test` only — no third-party test framework. Test files are colocated
  as `*.test.js` next to the source.
- Shared doubles (`mockModule`, `createMockRequest`, `createMockResponse`)
  live in `test-helpers.js`. Modules are isolated by seeding `require.cache`
  with a stub before requiring the module under test; `node --test` runs each
  file in its own process so cache edits don't leak.
- Entry points guard side effects with `if (require.main === module)` so they
  can be imported by tests without starting a server or opening a connection.
