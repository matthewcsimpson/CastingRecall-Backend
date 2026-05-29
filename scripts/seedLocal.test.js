const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Control the filesystem + repository boundaries; use the real puzzleFormatter.
let readdirImpl;
let readFileImpl;
const inserted = [];

mockModule(require.resolve("dotenv"), { config: () => ({ parsed: {} }) });
mockModule(require.resolve("fs/promises"), {
  readdir: (...args) => readdirImpl(...args),
  readFile: (...args) => readFileImpl(...args),
});
mockModule(require.resolve("../utilities/db"), {
  initializePool: async () => {},
  closePool: async () => {},
});
mockModule(require.resolve("../repositories/puzzleRepository"), {
  insertPuzzleToDb: async (payload) => {
    inserted.push(payload);
  },
});

const { readPuzzleFiles, loadPuzzle, seed } = require("./seedLocal");

beforeEach(() => {
  inserted.length = 0;
  readdirImpl = async () => [];
  readFileImpl = async () => "{}";
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

// --- readPuzzleFiles ---

test("readPuzzleFiles keeps only .json files, sorted", async () => {
  readdirImpl = async () => ["b.json", "a.json", "notes.txt", "c.JSON"];
  const files = await readPuzzleFiles();
  assert.deepEqual(files, ["a.json", "b.json"]);
});

test("readPuzzleFiles returns an empty list when the directory is missing", async () => {
  readdirImpl = async () => {
    const error = new Error("missing");
    error.code = "ENOENT";
    throw error;
  };
  assert.deepEqual(await readPuzzleFiles(), []);
});

test("readPuzzleFiles rethrows non-ENOENT errors", async () => {
  readdirImpl = async () => {
    const error = new Error("permission denied");
    error.code = "EACCES";
    throw error;
  };
  await assert.rejects(readPuzzleFiles(), /permission denied/);
});

// --- loadPuzzle ---

test("loadPuzzle parses the file and normalizes it", async () => {
  readFileImpl = async () =>
    JSON.stringify({ puzzleId: 5, puzzle: [{ title: "Heat" }], keyPeople: [] });
  const puzzle = await loadPuzzle("5.json");
  assert.equal(puzzle.puzzleId, 5);
  assert.equal(puzzle.puzzle[0].title, "Heat");
});

// --- seed ---

test("seed inserts each valid puzzle file", async () => {
  readdirImpl = async () => ["100.json"];
  readFileImpl = async () =>
    JSON.stringify({
      puzzleId: 100,
      puzzle: [{ title: "Heat" }],
      keyPeople: ["Pacino"],
    });

  await seed();

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].puzzleId, 100);
  assert.equal(inserted[0].puzzle[0].title, "Heat");
});

test("seed does nothing when there are no puzzle files", async () => {
  readdirImpl = async () => [];
  await seed();
  assert.equal(inserted.length, 0);
});

test("seed skips files that normalize without a puzzleId", async () => {
  readdirImpl = async () => ["broken.json"];
  readFileImpl = async () => JSON.stringify({ puzzle: [] }); // no puzzleId / id
  await seed();
  assert.equal(inserted.length, 0);
});

test("seed continues past a file that fails to load", async () => {
  readdirImpl = async () => ["bad.json", "good.json"];
  readFileImpl = async (filePath) => {
    if (filePath.endsWith("bad.json")) {
      return "{not valid json";
    }
    return JSON.stringify({ puzzleId: 7, puzzle: [], keyPeople: [] });
  };

  await seed();

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].puzzleId, 7);
});
