// Retry behaviour lives in its own file because makePuzzle reads MAX_RETRIES
// once at module load. The sibling makePuzzle.test.js pins MAX_RETRIES=0 for
// fast failure paths; here we set a non-zero budget (and zero backoff delay)
// to exercise fetchWithRetry's retry loop and status-based retry decisions.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

process.env.MAX_RETRIES = "2";
process.env.RETRY_DELAY_MS = "0";

const createExternalServiceError = (message, cause) =>
  Object.assign(new Error(message), {
    name: "ExternalServiceError",
    statusCode: 502,
    isExternalServiceError: true,
    cause,
  });

// An axios-shaped error carrying an HTTP status, as tmdbClient would throw.
const httpError = (status) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

let seedAttempts; // how many times the seed-discover endpoint was hit
let seedBehaviour; // (attempt) => results array, or throws to simulate failure
let linkNonce;

const tmdbGet = async (url) => {
  if (url.startsWith("credits|")) {
    const movieId = url.slice("credits|".length);
    return {
      data: {
        cast: [0, 1, 2, 3, 4].map((order) => ({
          id: `${movieId}-a${order}`,
          name: `Actor ${order}`,
          order,
          character: "Role",
        })),
        crew: [{ id: `${movieId}-d`, name: "Director", job: "Director" }],
      },
    };
  }

  const params = JSON.parse(url.slice("discover|".length));
  if (params.with_cast !== undefined) {
    // Linked-movie discovery: always return a fresh, distinct eligible movie
    // so a successful chain can build to its full length.
    linkNonce += 1;
    return {
      data: {
        results: [
          {
            id: `link${linkNonce}`,
            genre_ids: [28],
            release_date: "2005-01-01",
            title: `Linked ${linkNonce}`,
          },
        ],
      },
    };
  }

  // Seed discovery: behaviour controlled per attempt so we can simulate
  // transient failures and count retries.
  seedAttempts += 1;
  return { data: { results: seedBehaviour(seedAttempts) } };
};

mockModule(require.resolve("./tmdbClient"), {
  createExternalServiceError,
  tmdbClient: { get: (url) => tmdbGet(url) },
  buildCreditsUrl: (movieId) => `credits|${movieId}`,
  buildDiscoverUrl: (params) => `discover|${JSON.stringify(params)}`,
});

const { makePuzzle } = require("./makePuzzle");

const seedResults = () => [
  { id: "seed", genre_ids: [28], release_date: "2000-01-01", title: "Seed" },
];

beforeEach(() => {
  seedAttempts = 0;
  linkNonce = 0;
  seedBehaviour = () => seedResults();
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

test("retries a transient 5xx on the seed request, then succeeds", async () => {
  seedBehaviour = (attempt) => {
    if (attempt < 3) {
      throw httpError(503);
    }
    return seedResults();
  };

  const result = await makePuzzle();

  assert.equal(seedAttempts, 3, "two failures then a success");
  assert.equal(result.puzzle.length, 6);
});

test("gives up after exhausting the retry budget on persistent 5xx", async () => {
  seedBehaviour = () => {
    throw httpError(503);
  };

  await assert.rejects(makePuzzle(), (error) => {
    // A non-404 5xx propagates untagged; makePuzzle wraps it with context.
    assert.match(error.message, /Failed to generate puzzle/);
    assert.notEqual(error.isExternalServiceError, true);
    return true;
  });
  // Initial attempt plus MAX_RETRIES (2) retries.
  assert.equal(seedAttempts, 3);
});

test("does not retry a non-5xx (4xx) response", async () => {
  seedBehaviour = () => {
    throw httpError(400);
  };

  await assert.rejects(makePuzzle(), () => true);
  assert.equal(seedAttempts, 1, "4xx short-circuits without retrying");
});

test("maps a 404 to an external 'resource not found' error without retrying", async () => {
  seedBehaviour = () => {
    throw httpError(404);
  };

  await assert.rejects(makePuzzle(), (error) => {
    assert.equal(error.isExternalServiceError, true);
    assert.match(error.message, /resource not found/i);
    return true;
  });
  assert.equal(seedAttempts, 1, "404 short-circuits without retrying");
});
