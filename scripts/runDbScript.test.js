const { test, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

let initImpl;
let closeImpl;
const calls = [];

mockModule(require.resolve("../utilities/db"), {
  initializePool: async () => {
    calls.push("init");
    return initImpl();
  },
  closePool: async () => {
    calls.push("close");
    return closeImpl();
  },
});

const { runDbScript } = require("./runDbScript");

beforeEach(() => {
  calls.length = 0;
  initImpl = async () => {};
  closeImpl = async () => {};
  console.error = () => {};
  console.info = () => {};
});

test("runs the task then closes the pool and exits 0 on success", async (t) => {
  const exit = t.mock.method(process, "exit", () => {});
  let taskRan = false;
  const task = async () => {
    taskRan = true;
  };

  await runDbScript("Migration", task);

  assert.equal(taskRan, true);
  assert.deepEqual(calls, ["init", "close"]);
  assert.equal(exit.mock.calls[0].arguments[0], 0);
});

test("exits 1 when the task throws but still closes the pool", async (t) => {
  const exit = t.mock.method(process, "exit", () => {});
  const task = async () => {
    throw new Error("task failed");
  };

  await runDbScript("Migration", task);

  assert.deepEqual(calls, ["init", "close"]);
  assert.equal(exit.mock.calls[0].arguments[0], 1);
});

test("exits 1 when pool initialization throws", async (t) => {
  const exit = t.mock.method(process, "exit", () => {});
  initImpl = async () => {
    throw new Error("init failed");
  };
  let taskRan = false;

  await runDbScript("Seeding", async () => {
    taskRan = true;
  });

  assert.equal(taskRan, false);
  assert.deepEqual(calls, ["init", "close"]);
  assert.equal(exit.mock.calls[0].arguments[0], 1);
});

test("exits 1 when closing the pool throws", async (t) => {
  const exit = t.mock.method(process, "exit", () => {});
  closeImpl = async () => {
    throw new Error("close failed");
  };

  await runDbScript("Migration", async () => {});

  assert.equal(exit.mock.calls[0].arguments[0], 1);
});
