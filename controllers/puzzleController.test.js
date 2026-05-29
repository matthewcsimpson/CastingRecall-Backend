const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  mockModule,
  createMockRequest,
  createMockResponse,
} = require("../test-helpers");

// Mutable stubs for the controller's collaborators. makePuzzle and the
// repository are full stubs (no DB / no network); the formatter is the real
// implementation wrapped so a single test can force a normalization failure.
let makePuzzleImpl;
let insertImpl;
let listImpl;
let latestImpl;
let byIdImpl;

const realFormatter = require("../utilities/puzzleFormatter");
let normalizePuzzleImpl = realFormatter.normalizePuzzle;

mockModule(require.resolve("../utilities/makePuzzle"), {
  makePuzzle: (...args) => makePuzzleImpl(...args),
});
mockModule(require.resolve("../repositories/puzzleRepository"), {
  insertPuzzleToDb: (...args) => insertImpl(...args),
  listPuzzlesFromDb: (...args) => listImpl(...args),
  getLatestPuzzleFromDb: (...args) => latestImpl(...args),
  getPuzzleByIdFromDb: (...args) => byIdImpl(...args),
});
mockModule(require.resolve("../utilities/puzzleFormatter"), {
  ...realFormatter,
  normalizePuzzle: (...args) => normalizePuzzleImpl(...args),
});

const {
  generatePuzzle,
  listPuzzles,
  getLatestPuzzle,
  getPuzzleById,
} = require("./puzzleController");

const externalError = (message) =>
  Object.assign(new Error(message), { isExternalServiceError: true });

beforeEach(() => {
  process.env.GENERATION_KEY = "secret-key";
  makePuzzleImpl = async () => ({ puzzleId: 1, puzzle: [], keyPeople: [] });
  insertImpl = async () => {};
  listImpl = async () => [];
  latestImpl = async () => null;
  byIdImpl = async () => null;
  normalizePuzzleImpl = realFormatter.normalizePuzzle;
  // Quiet the controller's diagnostic logging during tests.
  console.error = () => {};
  console.warn = () => {};
});

// --- generatePuzzle: auth boundary ---

test("generatePuzzle returns 500 when GENERATION_KEY is not configured", async () => {
  delete process.env.GENERATION_KEY;
  const res = createMockResponse();
  await generatePuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Puzzle generation unavailable" });
});

test("generatePuzzle returns 403 when the Authorization header is missing", async () => {
  const res = createMockResponse();
  await generatePuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Missing generation key" });
});

test("generatePuzzle returns 403 when the scheme is not Bearer", async () => {
  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Basic secret-key" } }),
    res
  );
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Missing generation key" });
});

test("generatePuzzle returns 403 when the key is wrong", async () => {
  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Bearer wrong-key" } }),
    res
  );
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Invalid generation key" });
});

// --- generatePuzzle: generation flow ---

test("generatePuzzle generates, persists, and confirms on a valid key", async () => {
  let inserted = null;
  makePuzzleImpl = async () => ({
    puzzleId: 99,
    puzzle: [{ title: "Heat" }],
    keyPeople: ["Pacino"],
  });
  insertImpl = async (payload) => {
    inserted = payload;
  };

  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Bearer secret-key" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "puzzle made!");
  assert.deepEqual(inserted, {
    puzzleId: 99,
    puzzle: [{ title: "Heat" }],
    keyPeople: ["Pacino"],
  });
});

test("generatePuzzle retries then succeeds within the attempt budget", async () => {
  let attempts = 0;
  makePuzzleImpl = async () => {
    attempts += 1;
    if (attempts < 2) {
      throw externalError("transient");
    }
    return { puzzleId: 1, puzzle: [], keyPeople: [] };
  };

  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Bearer secret-key" } }),
    res
  );

  assert.equal(attempts, 2);
  assert.equal(res.statusCode, 200);
});

test("generatePuzzle returns 502 when generation exhausts retries with an external error", async () => {
  let attempts = 0;
  makePuzzleImpl = async () => {
    attempts += 1;
    throw externalError("TMDB unavailable");
  };

  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Bearer secret-key" } }),
    res
  );

  assert.equal(attempts, 3); // MAX_GENERATION_ATTEMPTS default
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { message: "TMDB unavailable" });
});

test("generatePuzzle returns 500 when generation fails with a generic error", async () => {
  makePuzzleImpl = async () => {
    throw new Error("unexpected");
  };

  const res = createMockResponse();
  await generatePuzzle(
    createMockRequest({ headers: { authorization: "Bearer secret-key" } }),
    res
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Unable to generate puzzle" });
});

// --- listPuzzles ---

test("listPuzzles returns the puzzles wrapped in an object", async () => {
  listImpl = async () => [{ puzzleId: 1 }, { puzzleId: 2 }];
  const res = createMockResponse();
  await listPuzzles(createMockRequest(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { puzzles: [{ puzzleId: 1 }, { puzzleId: 2 }] });
});

test("listPuzzles returns 500 when the repository throws", async () => {
  listImpl = async () => {
    throw new Error("db down");
  };
  const res = createMockResponse();
  await listPuzzles(createMockRequest(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Unable to list puzzles" });
});

// --- getLatestPuzzle ---

test("getLatestPuzzle returns 204 when there are no puzzles", async () => {
  latestImpl = async () => null;
  const res = createMockResponse();
  await getLatestPuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 204);
});

test("getLatestPuzzle returns the normalized latest puzzle", async () => {
  latestImpl = async () => ({
    puzzleId: 5,
    puzzle: [{ title: "Heat" }],
    keyPeople: ["Pacino"],
  });
  const res = createMockResponse();
  await getLatestPuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.puzzleId, 5);
  assert.equal(res.body.puzzle[0].title, "Heat");
});

test("getLatestPuzzle returns 500 when the stored puzzle cannot be normalized", async () => {
  latestImpl = async () => ({ puzzleId: 5, puzzle: [], keyPeople: [] });
  normalizePuzzleImpl = () => null;
  const res = createMockResponse();
  await getLatestPuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Stored puzzle is invalid" });
});

test("getLatestPuzzle returns 500 when the repository throws", async () => {
  latestImpl = async () => {
    throw new Error("db down");
  };
  const res = createMockResponse();
  await getLatestPuzzle(createMockRequest(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Unable to load latest puzzle" });
});

// --- getPuzzleById ---

test("getPuzzleById returns 400 for a non-numeric id", async () => {
  const res = createMockResponse();
  await getPuzzleById(createMockRequest({ params: { puzzleid: "abc" } }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid puzzle id" });
});

test("getPuzzleById returns 400 for a non-integer id", async () => {
  const res = createMockResponse();
  await getPuzzleById(createMockRequest({ params: { puzzleid: "1.5" } }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid puzzle id" });
});

test("getPuzzleById returns 404 when the puzzle is not found", async () => {
  byIdImpl = async () => null;
  const res = createMockResponse();
  await getPuzzleById(createMockRequest({ params: { puzzleid: "7" } }), res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Puzzle not found" });
});

test("getPuzzleById returns the normalized puzzle when found", async () => {
  let requestedId = null;
  byIdImpl = async (id) => {
    requestedId = id;
    return { puzzleId: 7, puzzle: [{ title: "Heat" }], keyPeople: ["Pacino"] };
  };
  const res = createMockResponse();
  await getPuzzleById(createMockRequest({ params: { puzzleid: "7" } }), res);
  assert.equal(requestedId, 7);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.puzzleId, 7);
});

test("getPuzzleById returns 500 when the repository throws", async () => {
  byIdImpl = async () => {
    throw new Error("db down");
  };
  const res = createMockResponse();
  await getPuzzleById(createMockRequest({ params: { puzzleid: "7" } }), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Unable to load puzzle" });
});
