const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNormalizedMovie,
  normalizePuzzle,
  deriveKeyPeople,
} = require("./puzzleFormatter");

const rawMovie = () => ({
  id: 10,
  title: "Heat",
  original_title: "Heat",
  poster_path: "/poster.jpg",
  release_date: "1995-12-15",
  overview: "A crime saga.",
  genre_ids: [80, "18", "not-a-number"],
  directors: [{ id: 5, name: "Michael Mann" }, { name: "" }],
  cast: [
    { id: 1, name: "Al Pacino", character: "Hanna", profile_path: "/a.jpg" },
    { id: 2, original_name: "Robert De Niro", character: "" },
    { id: 3, name: "" },
  ],
  keyPerson: { name: "Al Pacino" },
});

// --- buildNormalizedMovie ---

test("buildNormalizedMovie keeps the title and passes through poster path", () => {
  const result = buildNormalizedMovie(rawMovie());
  assert.equal(result.title, "Heat");
  assert.equal(result.poster_path, "/poster.jpg");
  assert.equal(result.id, 10);
});

test("buildNormalizedMovie falls back to name when title is absent", () => {
  const result = buildNormalizedMovie({ name: "Severance", cast: [] });
  assert.equal(result.title, "Severance");
});

test("buildNormalizedMovie drops non-numeric genre ids", () => {
  const result = buildNormalizedMovie(rawMovie());
  assert.deepEqual(result.genre_ids, [80, 18]);
});

test("buildNormalizedMovie drops directors with no resolvable name", () => {
  const result = buildNormalizedMovie(rawMovie());
  assert.deepEqual(result.directors, [{ id: 5, name: "Michael Mann" }]);
});

test("buildNormalizedMovie sanitizes cast and resolves original_name", () => {
  const result = buildNormalizedMovie(rawMovie());
  assert.deepEqual(result.cast, [
    {
      id: 1,
      name: "Al Pacino",
      character: "Hanna",
      profile_path: "/a.jpg",
    },
    {
      id: 2,
      name: "Robert De Niro",
      character: "",
      profile_path: null,
    },
  ]);
});

test("buildNormalizedMovie uses the supplied key person name", () => {
  const result = buildNormalizedMovie(rawMovie());
  assert.deepEqual(result.keyPerson, { name: "Al Pacino" });
});

test("buildNormalizedMovie falls back to first named cast member for key person", () => {
  const movie = rawMovie();
  movie.keyPerson = {};
  const result = buildNormalizedMovie(movie);
  assert.deepEqual(result.keyPerson, { name: "Al Pacino" });
});

test("buildNormalizedMovie returns safe defaults for empty input", () => {
  const result = buildNormalizedMovie();
  assert.equal(result.id, null);
  assert.equal(result.title, "");
  assert.deepEqual(result.cast, []);
  assert.deepEqual(result.directors, []);
  assert.deepEqual(result.genre_ids, []);
  assert.deepEqual(result.keyPerson, { name: "" });
});

// --- deriveKeyPeople ---

test("deriveKeyPeople maps one trimmed key person name per movie", () => {
  const movies = [
    { keyPerson: { name: " Al Pacino " } },
    { keyPerson: { name: "Robert De Niro" } },
    {},
  ];
  assert.deepEqual(deriveKeyPeople(movies), [
    "Al Pacino",
    "Robert De Niro",
    "",
  ]);
});

// --- normalizePuzzle ---

test("normalizePuzzle returns null for a non-object", () => {
  assert.equal(normalizePuzzle(null), null);
  assert.equal(normalizePuzzle("nope"), null);
});

test("normalizePuzzle normalizes movies and preserves matching keyPeople", () => {
  const result = normalizePuzzle({
    puzzleId: 123,
    puzzle: [rawMovie()],
    keyPeople: ["Stored Name"],
  });
  assert.equal(result.puzzleId, 123);
  assert.equal(result.puzzle.length, 1);
  assert.equal(result.puzzle[0].title, "Heat");
  assert.deepEqual(result.keyPeople, ["Stored Name"]);
});

test("normalizePuzzle rebuilds keyPeople when length mismatches", () => {
  const result = normalizePuzzle({
    puzzleId: 123,
    puzzle: [rawMovie()],
    keyPeople: ["too", "many", "names"],
  });
  assert.deepEqual(result.keyPeople, ["Al Pacino"]);
});

test("normalizePuzzle derives keyPeople when none are supplied", () => {
  const result = normalizePuzzle({ puzzleId: 1, puzzle: [rawMovie()] });
  assert.deepEqual(result.keyPeople, ["Al Pacino"]);
});

test("normalizePuzzle falls back to id then null for puzzleId", () => {
  assert.equal(normalizePuzzle({ id: 7, puzzle: [] }).puzzleId, 7);
  assert.equal(normalizePuzzle({ puzzle: [] }).puzzleId, null);
});

test("normalizePuzzle treats a non-array puzzle as empty", () => {
  const result = normalizePuzzle({ puzzleId: 1, puzzle: "oops" });
  assert.deepEqual(result.puzzle, []);
  assert.deepEqual(result.keyPeople, []);
});
