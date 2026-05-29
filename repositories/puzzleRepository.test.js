const { test, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Stub the db boundary so the repository never opens a real connection. The
// query implementation is swapped per test via `queryImpl`, and every call is
// recorded for assertion.
let queryImpl;
const queryCalls = [];
mockModule(require.resolve("../utilities/db"), {
  query: (text, params) => {
    queryCalls.push({ text, params });
    return queryImpl(text, params);
  },
});

const {
  insertPuzzleToDb,
  listPuzzlesFromDb,
  getLatestPuzzleFromDb,
  getPuzzleByIdFromDb,
} = require("./puzzleRepository");

beforeEach(() => {
  queryCalls.length = 0;
  queryImpl = async () => ({ rows: [] });
  mock.restoreAll();
});

// --- insertPuzzleToDb ---

test("insertPuzzleToDb serializes the puzzle and forwards params", async () => {
  await insertPuzzleToDb({
    puzzleId: 1700000000000,
    puzzle: [{ title: "Heat" }],
    keyPeople: ["Al Pacino"],
  });

  assert.equal(queryCalls.length, 1);
  const { text, params } = queryCalls[0];
  assert.match(text, /INSERT INTO puzzles/);
  assert.match(text, /ON CONFLICT \(puzzle_id\)/);
  assert.equal(params[0], 1700000000000);
  assert.equal(params[1], JSON.stringify([{ title: "Heat" }]));
  assert.deepEqual(params[2], ["Al Pacino"]);
});

test("insertPuzzleToDb defaults missing puzzle and keyPeople", async () => {
  await insertPuzzleToDb({ puzzleId: 5 });
  const { params } = queryCalls[0];
  assert.equal(params[1], JSON.stringify([]));
  assert.deepEqual(params[2], []);
});

test("insertPuzzleToDb re-throws when the query fails", async () => {
  mock.method(console, "error", () => {});
  queryImpl = async () => {
    throw new Error("db down");
  };
  await assert.rejects(
    insertPuzzleToDb({ puzzleId: 5, puzzle: [], keyPeople: [] }),
    /db down/
  );
});

// --- listPuzzlesFromDb / mapPuzzleRow ---

test("listPuzzlesFromDb maps rows and coerces the id to a number", async () => {
  queryImpl = async () => ({
    rows: [
      { puzzle_id: "42", puzzle: [{ title: "Heat" }], key_people: ["Pacino"] },
    ],
  });
  const result = await listPuzzlesFromDb();
  assert.equal(result.length, 1);
  assert.equal(result[0].puzzleId, 42);
  assert.deepEqual(result[0].puzzle, [{ title: "Heat" }]);
  assert.deepEqual(result[0].keyPeople, ["Pacino"]);
});

test("listPuzzlesFromDb parses a JSON-string puzzle column", async () => {
  queryImpl = async () => ({
    rows: [{ puzzle_id: 1, puzzle: '[{"title":"Heat"}]', key_people: [] }],
  });
  const [record] = await listPuzzlesFromDb();
  assert.deepEqual(record.puzzle, [{ title: "Heat" }]);
});

test("listPuzzlesFromDb returns an empty array for a malformed JSON puzzle", async () => {
  mock.method(console, "error", () => {});
  queryImpl = async () => ({
    rows: [{ puzzle_id: 1, puzzle: "{not json", key_people: [] }],
  });
  const [record] = await listPuzzlesFromDb();
  assert.deepEqual(record.puzzle, []);
});

test("listPuzzlesFromDb treats an empty-string puzzle as empty", async () => {
  queryImpl = async () => ({
    rows: [{ puzzle_id: 1, puzzle: "", key_people: null }],
  });
  const [record] = await listPuzzlesFromDb();
  assert.deepEqual(record.puzzle, []);
  assert.deepEqual(record.keyPeople, []);
});

// --- getLatestPuzzleFromDb ---

test("getLatestPuzzleFromDb returns null when there are no rows", async () => {
  queryImpl = async () => ({ rows: [] });
  assert.equal(await getLatestPuzzleFromDb(), null);
});

test("getLatestPuzzleFromDb returns the first mapped row", async () => {
  queryImpl = async () => ({
    rows: [{ puzzle_id: 9, puzzle: [], key_people: [] }],
  });
  const result = await getLatestPuzzleFromDb();
  assert.equal(result.puzzleId, 9);
});

// --- getPuzzleByIdFromDb ---

test("getPuzzleByIdFromDb passes the id as a bound param", async () => {
  queryImpl = async () => ({
    rows: [{ puzzle_id: 7, puzzle: [], key_people: [] }],
  });
  await getPuzzleByIdFromDb(7);
  assert.deepEqual(queryCalls[0].params, [7]);
});

test("getPuzzleByIdFromDb returns null when not found", async () => {
  queryImpl = async () => ({ rows: [] });
  assert.equal(await getPuzzleByIdFromDb(123), null);
});
