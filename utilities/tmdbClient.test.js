const { test } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule, unmock } = require("../test-helpers");

// tmdbClient reads its configuration from the environment at import time and
// throws if required values are missing. Stub dotenv so a real .env file can't
// repopulate the environment behind our backs, then drive env explicitly and
// bust the module cache between scenarios.
const dotenvPath = require.resolve("dotenv");
mockModule(dotenvPath, { config: () => ({ parsed: {} }) });

const modulePath = require.resolve("./tmdbClient");

const VALID_ENV = {
  TMDB_API_TOKEN: "test-token",
  TMDB_SEARCH_CREDITS_FRONT: "https://api.themoviedb.org/3/movie/",
  TMDB_SEARCH_CREDITS_BACK: "/credits",
  TMDB_DISCOVER_URL: "https://api.themoviedb.org/3/discover/movie",
};

const loadTmdbClient = (env = VALID_ENV) => {
  unmock(modulePath);
  for (const key of Object.keys(VALID_ENV)) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  return require("./tmdbClient");
};

test("createExternalServiceError tags the error and carries the cause", () => {
  const { createExternalServiceError } = loadTmdbClient();
  const cause = new Error("boom");
  const error = createExternalServiceError("upstream failed", cause);

  assert.equal(error.name, "ExternalServiceError");
  assert.equal(error.message, "upstream failed");
  assert.equal(error.statusCode, 502);
  assert.equal(error.isExternalServiceError, true);
  assert.equal(error.cause, cause);
});

test("createExternalServiceError omits cause when none is given", () => {
  const { createExternalServiceError } = loadTmdbClient();
  const error = createExternalServiceError("no cause");
  assert.equal("cause" in error, false);
});

test("buildCreditsUrl interpolates front, id, and back fragments", () => {
  const { buildCreditsUrl } = loadTmdbClient();
  assert.equal(
    buildCreditsUrl(603),
    "https://api.themoviedb.org/3/movie/603/credits"
  );
});

test("buildDiscoverUrl sets supplied params on the URL", () => {
  const { buildDiscoverUrl } = loadTmdbClient();
  const url = new URL(buildDiscoverUrl({ primary_release_year: 1999, page: 1 }));
  assert.equal(url.searchParams.get("primary_release_year"), "1999");
  assert.equal(url.searchParams.get("page"), "1");
});

test("buildDiscoverUrl skips undefined and null params", () => {
  const { buildDiscoverUrl } = loadTmdbClient();
  const url = new URL(
    buildDiscoverUrl({ with_cast: undefined, region: null, language: "en-US" })
  );
  assert.equal(url.searchParams.has("with_cast"), false);
  assert.equal(url.searchParams.has("region"), false);
  assert.equal(url.searchParams.get("language"), "en-US");
});

test("buildDiscoverUrl throws when the discover URL is not configured", () => {
  const { buildDiscoverUrl } = loadTmdbClient({
    TMDB_API_TOKEN: "test-token",
    TMDB_SEARCH_CREDITS_FRONT: "https://x/movie/",
    TMDB_SEARCH_CREDITS_BACK: "/credits",
    // TMDB_DISCOVER_URL deliberately omitted
  });
  assert.throws(() => buildDiscoverUrl({ page: 1 }), /discover URL not configured/);
});

test("module import throws when the API token is missing", () => {
  assert.throws(
    () =>
      loadTmdbClient({
        TMDB_SEARCH_CREDITS_FRONT: "https://x/movie/",
        TMDB_SEARCH_CREDITS_BACK: "/credits",
        TMDB_DISCOVER_URL: "https://x/discover",
      }),
    /TMDB API token not configured/
  );
});

test("module import throws when credits URL fragments are missing", () => {
  assert.throws(
    () =>
      loadTmdbClient({
        TMDB_API_TOKEN: "test-token",
        TMDB_DISCOVER_URL: "https://x/discover",
      }),
    /credits URL fragments not configured/
  );
});
