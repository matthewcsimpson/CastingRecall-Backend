const { test } = require("node:test");
const assert = require("node:assert/strict");

const { getRandomNumberUpToInt, getRandomActor } = require("./randomUtils");

test("getRandomNumberUpToInt returns a value within [0, num)", (t) => {
  t.mock.method(Math, "random", () => 0.99);
  assert.equal(getRandomNumberUpToInt(5), 4);
});

test("getRandomNumberUpToInt floors the lower bound to 0", (t) => {
  t.mock.method(Math, "random", () => 0);
  assert.equal(getRandomNumberUpToInt(5), 0);
});

test("getRandomNumberUpToInt returns 0 for zero", () => {
  assert.equal(getRandomNumberUpToInt(0), 0);
});

test("getRandomNumberUpToInt returns 0 for negative input", () => {
  assert.equal(getRandomNumberUpToInt(-3), 0);
});

test("getRandomNumberUpToInt returns 0 for non-finite input", () => {
  assert.equal(getRandomNumberUpToInt(Infinity), 0);
  assert.equal(getRandomNumberUpToInt(NaN), 0);
});

test("getRandomActor returns the selected element", (t) => {
  t.mock.method(Math, "random", () => 0); // selects index 0
  assert.equal(getRandomActor(["a", "b", "c"]), "a");
});

test("getRandomActor selects by random index", (t) => {
  t.mock.method(Math, "random", () => 0.99); // selects last index
  assert.equal(getRandomActor(["a", "b", "c"]), "c");
});

test("getRandomActor returns null for an empty array", () => {
  assert.equal(getRandomActor([]), null);
});

test("getRandomActor returns null for a non-array", () => {
  assert.equal(getRandomActor(null), null);
  assert.equal(getRandomActor(undefined), null);
  assert.equal(getRandomActor("nope"), null);
});
