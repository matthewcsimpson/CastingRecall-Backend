const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Control the filesystem and db boundaries the migration runner depends on.
let readdirImpl;
let readFileImpl;
let withClientImpl;

mockModule(require.resolve("dotenv"), { config: () => ({ parsed: {} }) });
mockModule(require.resolve("fs/promises"), {
  readdir: (...args) => readdirImpl(...args),
  readFile: (...args) => readFileImpl(...args),
});
mockModule(require.resolve("../utilities/db"), {
  withClient: (callback) => withClientImpl(callback),
});

const {
  ensureMigrationsTable,
  loadAppliedMigrations,
  applyMigration,
  run,
} = require("./runMigration");

// A fake pg client that records queries and answers the "already applied"
// lookup from `appliedRows`.
const makeClient = (appliedRows = []) => {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text: text.trim(), params });
      if (/SELECT file_name FROM schema_migrations/.test(text)) {
        return { rows: appliedRows };
      }
      return { rows: [] };
    },
  };
};

beforeEach(() => {
  readdirImpl = async () => [];
  readFileImpl = async () => "";
  withClientImpl = async (callback) => callback(makeClient());
  console.info = () => {};
  console.error = () => {};
});

test("ensureMigrationsTable creates the tracking table if absent", async () => {
  const client = makeClient();
  await ensureMigrationsTable(client);
  assert.match(client.calls[0].text, /CREATE TABLE IF NOT EXISTS schema_migrations/);
});

test("loadAppliedMigrations returns a set of applied file names", async () => {
  const client = makeClient([
    { file_name: "001_init.sql" },
    { file_name: "002_data.sql" },
  ]);
  const applied = await loadAppliedMigrations(client);
  assert.ok(applied instanceof Set);
  assert.equal(applied.has("001_init.sql"), true);
  assert.equal(applied.has("002_data.sql"), true);
  assert.equal(applied.size, 2);
});

test("applyMigration runs the SQL inside a committed transaction", async () => {
  const client = makeClient();
  await applyMigration(client, "003_add_col.sql", "ALTER TABLE puzzles ...");

  const texts = client.calls.map((call) => call.text);
  assert.deepEqual(texts.slice(0, 1), ["BEGIN"]);
  assert.equal(texts.includes("ALTER TABLE puzzles ..."), true);
  assert.equal(texts.includes("COMMIT"), true);
  const insert = client.calls.find((call) => /INSERT INTO schema_migrations/.test(call.text));
  assert.deepEqual(insert.params, ["003_add_col.sql"]);
});

test("applyMigration rolls back and rethrows when the SQL fails", async () => {
  const calls = [];
  const client = {
    query: async (text) => {
      calls.push(text.trim());
      if (/ALTER TABLE/.test(text)) {
        throw new Error("syntax error");
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    applyMigration(client, "bad.sql", "ALTER TABLE bad"),
    /syntax error/
  );
  assert.equal(calls.includes("BEGIN"), true);
  assert.equal(calls.includes("ROLLBACK"), true);
  assert.equal(calls.includes("COMMIT"), false);
});

test("run does nothing when there are no .sql files", async () => {
  readdirImpl = async () => ["README.md", "notes.txt"];
  let withClientCalled = false;
  withClientImpl = async (callback) => {
    withClientCalled = true;
    return callback(makeClient());
  };

  await run();
  assert.equal(withClientCalled, false);
});

test("run applies only migrations that have not been applied yet", async () => {
  readdirImpl = async () => ["002_data.sql", "001_init.sql", "ignore.txt"];
  readFileImpl = async (filePath) => `SQL for ${filePath}`;

  const client = makeClient([{ file_name: "001_init.sql" }]);
  withClientImpl = async (callback) => callback(client);

  await run();

  const inserts = client.calls
    .filter((call) => /INSERT INTO schema_migrations/.test(call.text))
    .map((call) => call.params[0]);
  // 001 was already applied; only 002 should be inserted.
  assert.deepEqual(inserts, ["002_data.sql"]);
});
