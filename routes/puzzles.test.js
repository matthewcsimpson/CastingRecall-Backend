const { test } = require("node:test");
const assert = require("node:assert/strict");

const { mockModule } = require("../test-helpers");

// Stub the controller so requiring the router does not pull in the database /
// TMDB layers. We assert only on the route table the router wires up.
mockModule(require.resolve("../controllers/puzzleController"), {
  generatePuzzle() {},
  listPuzzles() {},
  getLatestPuzzle() {},
  getPuzzleById() {},
});

const router = require("./puzzles");

const routeTable = () =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .sort(),
    }));

test("exports an Express router", () => {
  assert.equal(typeof router, "function");
});

test("wires the expected method + path for every endpoint", () => {
  const table = routeTable();
  assert.deepEqual(table, [
    { path: "/generate", methods: ["post"] },
    { path: "/list", methods: ["get"] },
    { path: "/latest", methods: ["get"] },
    { path: "/:puzzleid", methods: ["get"] },
    { path: "/", methods: ["get"] },
  ]);
});

test("generate is a POST-only endpoint", () => {
  const generate = routeTable().find((route) => route.path === "/generate");
  assert.deepEqual(generate.methods, ["post"]);
});
