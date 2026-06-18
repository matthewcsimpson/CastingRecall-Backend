const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Keep retries off so failure paths resolve immediately (no backoff delay).
process.env.MAX_RETRIES = "0";
process.env.RETRY_DELAY_MS = "0";

// The only boundary makePuzzle reaches is tmdbClient. Stub it so discover and
// credits responses are fully controlled and no network or env config is
// needed. The real puzzleFormatter / movieFilters / randomUtils are used.
const createExternalServiceError = (message, cause) =>
  Object.assign(new Error(message), {
    name: "ExternalServiceError",
    statusCode: 502,
    isExternalServiceError: true,
    cause,
  });

let discoverSeedResults;
let discoverCastResults;
let creditsFor;
let linkCounter;
// makePuzzle keeps a module-level credits cache that lives for the whole test
// file. Use a per-test nonce in every movie id so cached credits from one test
// can never satisfy a later test.
let nonce = 0;

const tmdbGet = async (url) => {
  if (url.startsWith("credits|")) {
    const movieId = url.slice("credits|".length);
    return { data: creditsFor(movieId) };
  }
  const params = JSON.parse(url.slice("discover|".length));
  if (params.with_cast !== undefined) {
    return { data: { results: discoverCastResults() } };
  }
  return { data: { results: discoverSeedResults() } };
};

mockModule(require.resolve("./tmdbClient"), {
  createExternalServiceError,
  tmdbClient: { get: (url) => tmdbGet(url) },
  buildCreditsUrl: (movieId) => `credits|${movieId}`,
  buildDiscoverUrl: (params) => `discover|${JSON.stringify(params)}`,
});

const { makePuzzle } = require("./makePuzzle");

beforeEach(() => {
  linkCounter = 0;
  nonce += 1;
  const seedId = `seed${nonce}`;
  discoverSeedResults = () => [
    { id: seedId, genre_ids: [28], release_date: "2000-01-01", title: "Seed" },
  ];
  discoverCastResults = () => {
    linkCounter += 1;
    return [
      {
        id: `m${nonce}-${linkCounter}`,
        genre_ids: [28],
        release_date: "2005-01-01",
        title: `Movie m${nonce}-${linkCounter}`,
      },
    ];
  };
  creditsFor = (movieId) => ({
    cast: [0, 1, 2, 3, 4].map((order) => ({
      id: `${movieId}-a${order}`,
      name: `Actor ${movieId} ${order}`,
      order,
      character: "Role",
    })),
    crew: [{ id: `${movieId}-d`, name: `Director ${movieId}`, job: "Director" }],
  });
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

test("makePuzzle builds a six-movie chain with one key person each", async (t) => {
  t.mock.method(Math, "random", () => 0);

  const result = await makePuzzle();

  assert.equal(result.puzzle.length, 6);
  assert.equal(result.keyPeople.length, 6);
  assert.equal(typeof result.puzzleId, "number");
  for (const movie of result.puzzle) {
    assert.ok(movie.cast.length > 0, "each movie has cast");
    assert.ok(movie.title.length > 0, "each movie has a title");
    assert.equal(movie.directors[0].name, `Director ${movie.id}`);
  }
});

test("makePuzzle excludes already-used movies as the chain grows", async (t) => {
  t.mock.method(Math, "random", () => 0);
  const result = await makePuzzle();
  const ids = result.puzzle.map((movie) => movie.id);
  assert.equal(new Set(ids).size, ids.length, "all six movie ids are distinct");
});

test("makePuzzle throws an external error when the seed year has no movies", async () => {
  discoverSeedResults = () => [];
  await assert.rejects(makePuzzle(), (error) => {
    assert.equal(error.isExternalServiceError, true);
    assert.match(error.message, /no seed movies/i);
    return true;
  });
});

test("makePuzzle throws when the seed movie has no cast", async () => {
  creditsFor = () => ({ cast: [], crew: [] });
  await assert.rejects(makePuzzle(), /did not include cast data/);
});

test("makePuzzle throws when no connected movie can be found", async () => {
  discoverCastResults = () => [];
  await assert.rejects(makePuzzle(), /Unable to find a connected movie/);
});

test("makePuzzle wraps an unexpected error with context but leaves it untagged", async () => {
  discoverSeedResults = () => {
    throw new Error("socket hang up");
  };
  await assert.rejects(makePuzzle(), (error) => {
    // Not tagged external, so the controller maps it to 500, not 502.
    assert.notEqual(error.isExternalServiceError, true);
    assert.match(error.message, /Failed to generate puzzle/);
    assert.match(String(error.cause), /socket hang up/);
    return true;
  });
});
