const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  getReleaseYear,
  isWithinYearBounds,
  hasExcludedGenre,
  isEligibleMovie,
  LOWEST_YEAR,
} = require("./movieFilters");

// --- getReleaseYear ---

test("getReleaseYear extracts the year from an ISO date", () => {
  assert.equal(getReleaseYear({ release_date: "1994-09-23" }), 1994);
});

test("getReleaseYear returns null for a non-string date", () => {
  assert.equal(getReleaseYear({ release_date: 1994 }), null);
});

test("getReleaseYear returns null for a too-short date", () => {
  assert.equal(getReleaseYear({ release_date: "99" }), null);
});

test("getReleaseYear returns null for a missing date", () => {
  assert.equal(getReleaseYear({}), null);
});

test("getReleaseYear returns null when the leading chars are not numeric", () => {
  assert.equal(getReleaseYear({ release_date: "abcd-01-01" }), null);
});

// --- hasExcludedGenre ---

test("hasExcludedGenre detects documentary (99)", () => {
  assert.equal(hasExcludedGenre([28, 99]), true);
});

test("hasExcludedGenre detects TV-movie (10770)", () => {
  assert.equal(hasExcludedGenre([10770]), true);
});

test("hasExcludedGenre detects excluded genres given as strings", () => {
  assert.equal(hasExcludedGenre(["99"]), true);
});

test("hasExcludedGenre returns false when no genre is excluded", () => {
  assert.equal(hasExcludedGenre([28, 12, 878]), false);
});

test("hasExcludedGenre treats a non-numeric genre id as no-match", () => {
  assert.equal(hasExcludedGenre(["drama", 28]), false);
});

test("hasExcludedGenre returns false for a non-array", () => {
  assert.equal(hasExcludedGenre(null), false);
});

// --- isWithinYearBounds ---

test("isWithinYearBounds accepts a year inside the range", () => {
  assert.equal(
    isWithinYearBounds({ release_date: "2000-01-01" }, 2024),
    true
  );
});

test("isWithinYearBounds accepts the lower boundary year", () => {
  assert.equal(
    isWithinYearBounds({ release_date: `${LOWEST_YEAR}-01-01` }, 2024),
    true
  );
});

test("isWithinYearBounds rejects a year before the lower bound", () => {
  assert.equal(
    isWithinYearBounds({ release_date: `${LOWEST_YEAR - 1}-01-01` }, 2024),
    false
  );
});

test("isWithinYearBounds rejects a year after the current year", () => {
  assert.equal(
    isWithinYearBounds({ release_date: "2030-01-01" }, 2024),
    false
  );
});

test("isWithinYearBounds rejects an unparseable release date", () => {
  assert.equal(isWithinYearBounds({ release_date: "" }, 2024), false);
});

// --- isEligibleMovie ---

const eligibleMovie = {
  id: 1,
  genre_ids: [28, 12],
  release_date: "2005-06-01",
};

test("isEligibleMovie accepts a well-formed in-genre movie", () => {
  assert.equal(isEligibleMovie(eligibleMovie), true);
});

test("isEligibleMovie rejects a falsy movie", () => {
  assert.equal(isEligibleMovie(null), false);
});

test("isEligibleMovie rejects a movie whose id is disallowed", () => {
  assert.equal(
    isEligibleMovie(eligibleMovie, { disallowedIds: new Set([1]) }),
    false
  );
});

test("isEligibleMovie rejects a movie with no genre_ids array", () => {
  assert.equal(isEligibleMovie({ id: 2, genre_ids: undefined }), false);
});

test("isEligibleMovie rejects a movie in an excluded genre", () => {
  assert.equal(
    isEligibleMovie({ id: 3, genre_ids: [99], release_date: "2005-01-01" }),
    false
  );
});

test("isEligibleMovie ignores year bounds unless enforced", () => {
  const oldMovie = { id: 4, genre_ids: [28], release_date: "1900-01-01" };
  assert.equal(isEligibleMovie(oldMovie), true);
});

test("isEligibleMovie enforces year bounds when asked", () => {
  const oldMovie = { id: 4, genre_ids: [28], release_date: "1900-01-01" };
  assert.equal(
    isEligibleMovie(oldMovie, { enforceYearBounds: true, currentYear: 2024 }),
    false
  );
});

test("isEligibleMovie accepts an in-bounds movie when year is enforced", () => {
  assert.equal(
    isEligibleMovie(eligibleMovie, {
      enforceYearBounds: true,
      currentYear: 2024,
    }),
    true
  );
});
