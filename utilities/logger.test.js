const { test } = require("node:test");
const assert = require("node:assert/strict");

const { logger } = require("./logger");

// The logger writes one JSON line via the console method matching the level.
// Swap that method for the duration of the call, capture the emitted line, and
// return it parsed. Restored in finally so a failed assertion can't leak the
// stub into other tests.
const capture = (consoleMethod, emit) => {
  const original = console[consoleMethod];
  let line;
  console[consoleMethod] = (emitted) => {
    line = emitted;
  };
  try {
    emit();
  } finally {
    console[consoleMethod] = original;
  }
  return JSON.parse(line);
};

// --- level routing ---

test("info routes to console.log and tags the level", () => {
  const entry = capture("log", () => logger.info("hello"));
  assert.equal(entry.level, "info");
  assert.equal(entry.message, "hello");
});

test("warn routes to console.warn and tags the level", () => {
  const entry = capture("warn", () => logger.warn("careful"));
  assert.equal(entry.level, "warn");
  assert.equal(entry.message, "careful");
});

test("error routes to console.error and tags the level", () => {
  const entry = capture("error", () => logger.error("boom"));
  assert.equal(entry.level, "error");
  assert.equal(entry.message, "boom");
});

// --- structured context ---

test("includes the structured context when one is given", () => {
  const entry = capture("log", () => logger.info("user action", { userId: 7 }));
  assert.deepEqual(entry.context, { userId: 7 });
});

test("omits the context key when none is given", () => {
  const entry = capture("log", () => logger.info("ping"));
  assert.equal("context" in entry, false);
});

test("passes a non-Error context value through unchanged", () => {
  const entry = capture("log", () =>
    logger.info("counts", { count: 3, ok: true })
  );
  assert.deepEqual(entry.context, { count: 3, ok: true });
});

test("stamps an ISO-8601 timestamp", () => {
  const entry = capture("log", () => logger.info("tick"));
  assert.match(entry.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(Number.isNaN(Date.parse(entry.time)), false);
});

// --- error serialization ---

test("serializes an Error in context to name, message, and stack", () => {
  const entry = capture("error", () =>
    logger.error("failed", { error: new Error("nope") })
  );
  assert.equal(entry.context.error.name, "Error");
  assert.equal(entry.context.error.message, "nope");
  assert.equal(typeof entry.context.error.stack, "string");
  assert.match(entry.context.error.stack, /nope/);
});

test("serializes a nested Error cause to its own name/message/stack", () => {
  const error = new Error("wrapper", { cause: new Error("root cause") });
  const entry = capture("error", () => logger.error("failed", { error }));
  assert.equal(entry.context.error.cause.name, "Error");
  assert.equal(entry.context.error.cause.message, "root cause");
  assert.equal(typeof entry.context.error.cause.stack, "string");
});

test("passes a non-Error cause through unchanged", () => {
  const error = new Error("wrapper", { cause: "string reason" });
  const entry = capture("error", () => logger.error("failed", { error }));
  assert.equal(entry.context.error.cause, "string reason");
});

test("omits the cause key when the error has none", () => {
  const entry = capture("error", () =>
    logger.error("failed", { error: new Error("plain") })
  );
  assert.equal("cause" in entry.context.error, false);
});
