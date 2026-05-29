const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Fake pg Pool: records the config it was built with and every query, and lets
// a test control connect/query/end behaviour.
class FakePool {
  constructor(config) {
    this.config = config;
    FakePool.lastConfig = config;
    FakePool.instances.push(this);
    this.ended = false;
    this.handlers = {};
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  async query(text, params) {
    FakePool.queries.push({ text, params });
    return { rows: [] };
  }

  async connect() {
    return FakePool.client;
  }

  async end() {
    this.ended = true;
    if (FakePool.endError) {
      throw FakePool.endError;
    }
  }
}

const resetFakePool = () => {
  FakePool.instances = [];
  FakePool.queries = [];
  FakePool.lastConfig = null;
  FakePool.endError = null;
  FakePool.client = { release: () => { FakePool.client.released = true; }, released: false };
};

mockModule(require.resolve("dotenv"), { config: () => ({ parsed: {} }) });
mockModule(require.resolve("pg"), { Pool: FakePool });

const dbPath = require.resolve("./db");
const freshDb = () => {
  delete require.cache[dbPath];
  return require("./db");
};

beforeEach(() => {
  resetFakePool();
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  delete process.env.NODE_ENV;
  console.error = () => {};
});

test("initializePool builds a pool from DATABASE_URL and pings it", async () => {
  const db = freshDb();
  await db.initializePool();

  assert.equal(FakePool.instances.length, 1);
  assert.equal(FakePool.lastConfig.connectionString, process.env.DATABASE_URL);
  assert.equal(FakePool.lastConfig.max, 10);
  assert.equal(FakePool.lastConfig.idleTimeoutMillis, 30000);
  assert.equal(FakePool.lastConfig.ssl, undefined);
  assert.deepEqual(FakePool.queries[0], { text: "SELECT 1", params: undefined });
});

test("pool config enables SSL in production", async () => {
  process.env.NODE_ENV = "production";
  const db = freshDb();
  await db.initializePool();
  assert.deepEqual(FakePool.lastConfig.ssl, { rejectUnauthorized: false });
});

test("initializePool is idempotent (single pool, single ping)", async () => {
  const db = freshDb();
  await db.initializePool();
  await db.initializePool();
  assert.equal(FakePool.instances.length, 1);
  assert.equal(FakePool.queries.length, 1);
});

test("getPool memoizes the pool across calls", () => {
  const db = freshDb();
  const first = db.getPool();
  const second = db.getPool();
  assert.equal(first, second);
  assert.equal(FakePool.instances.length, 1);
});

test("getPool throws when DATABASE_URL is not defined", () => {
  delete process.env.DATABASE_URL;
  const db = freshDb();
  assert.throws(() => db.getPool(), /DATABASE_URL is not defined/);
});

test("query delegates to the pool", async () => {
  const db = freshDb();
  await db.query("SELECT * FROM puzzles", [1]);
  assert.deepEqual(FakePool.queries.at(-1), {
    text: "SELECT * FROM puzzles",
    params: [1],
  });
});

test("withClient runs the callback with a client and releases it", async () => {
  const db = freshDb();
  const result = await db.withClient(async (client) => {
    assert.equal(client, FakePool.client);
    return "done";
  });
  assert.equal(result, "done");
  assert.equal(FakePool.client.released, true);
});

test("withClient releases the client even when the callback throws", async () => {
  const db = freshDb();
  await assert.rejects(
    db.withClient(async () => {
      throw new Error("query failed");
    }),
    /query failed/
  );
  assert.equal(FakePool.client.released, true);
});

test("closePool ends the pool and allows a fresh one afterwards", async () => {
  const db = freshDb();
  const pool = db.getPool();
  await db.closePool();
  assert.equal(pool.ended, true);

  db.getPool(); // should create a new pool now that the old one is cleared
  assert.equal(FakePool.instances.length, 2);
});

test("closePool is a no-op when no pool exists", async () => {
  const db = freshDb();
  await db.closePool();
  assert.equal(FakePool.instances.length, 0);
});

test("closePool clears the pool even when end() throws", async () => {
  const db = freshDb();
  db.getPool();
  FakePool.endError = new Error("end boom");
  await db.closePool();

  db.getPool(); // pool was cleared despite the error, so a new one is created
  assert.equal(FakePool.instances.length, 2);
});
