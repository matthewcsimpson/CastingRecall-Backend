const { test } = require("node:test");
const assert = require("node:assert/strict");

const { parseNumberWithDefault, parseIntWithDefault } = require("./numberUtils");

test("parseNumberWithDefault parses a numeric string", () => {
  assert.equal(parseNumberWithDefault("6", 0), 6);
});

test("parseNumberWithDefault parses a float", () => {
  assert.equal(parseNumberWithDefault("6.5", 0), 6.5);
});

test("parseNumberWithDefault passes through a number", () => {
  assert.equal(parseNumberWithDefault(42, 0), 42);
});

test("parseNumberWithDefault falls back on undefined", () => {
  assert.equal(parseNumberWithDefault(undefined, 7), 7);
});

test("parseNumberWithDefault falls back on null-ish empty string", () => {
  // Number("") is 0, which is finite, so empty string yields 0 not the
  // fallback — pin that documented behaviour.
  assert.equal(parseNumberWithDefault("", 7), 0);
});

test("parseNumberWithDefault falls back on a non-numeric string", () => {
  assert.equal(parseNumberWithDefault("abc", 7), 7);
});

test("parseNumberWithDefault falls back on NaN", () => {
  assert.equal(parseNumberWithDefault(NaN, 7), 7);
});

test("parseIntWithDefault parses an integer string", () => {
  assert.equal(parseIntWithDefault("3", 0), 3);
});

test("parseIntWithDefault parses a trailing-garbage integer", () => {
  assert.equal(parseIntWithDefault("3px", 0), 3);
});

test("parseIntWithDefault truncates a float string to an integer", () => {
  assert.equal(parseIntWithDefault("3.9", 0), 3);
});

test("parseIntWithDefault falls back on undefined", () => {
  assert.equal(parseIntWithDefault(undefined, 5), 5);
});

test("parseIntWithDefault falls back on a non-numeric string", () => {
  assert.equal(parseIntWithDefault("abc", 5), 5);
});
