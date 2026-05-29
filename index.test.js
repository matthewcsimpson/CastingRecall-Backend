const { test, mock, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  mockModule,
  createMockRequest,
  createMockResponse,
} = require("./test-helpers");

// Stub the puzzle router (so the DB/TMDB layers are not loaded) and the db
// module (so importing index never opens a connection). The require.main guard
// in index.js means importing it here does not start a server.
mockModule(require.resolve("./routes/puzzles"), (_req, _res, next) => next());
mockModule(require.resolve("./utilities/db"), {
  initializePool: async () => {},
  closePool: async () => {},
});

const { app, requestLogger, redirectToPuzzle, errorHandler } = require("./index");

beforeEach(() => {
  mock.restoreAll();
});

test("exports an Express application", () => {
  assert.equal(typeof app, "function");
  assert.equal(typeof app.listen, "function");
});

test("requestLogger logs the request and calls next", () => {
  mock.method(console, "log", () => {});
  let nextCalled = false;
  requestLogger(
    createMockRequest({ headers: { host: "localhost" } }),
    createMockResponse(),
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
});

test("redirectToPuzzle issues a 301 to a scheme-relative /puzzle", () => {
  const req = createMockRequest({ headers: { host: "castingrecall.test" } });
  const res = createMockResponse();
  redirectToPuzzle(req, res);
  assert.equal(res.statusCode, 301);
  assert.equal(res.location, "/puzzle");
  assert.equal(res.ended, true);
});

test("errorHandler responds 500 with a generic message", () => {
  mock.method(console, "error", () => {});
  const res = createMockResponse();
  errorHandler(new Error("boom"), createMockRequest(), res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Internal server error" });
});

// One live route test: confirm the wired "/" route really 301s through Express.
let liveServer;
after(() => {
  if (liveServer) {
    liveServer.close();
  }
});

test("GET / returns a 301 redirect through the running app", async () => {
  mock.method(console, "log", () => {});
  liveServer = app.listen(0);
  await new Promise((resolve) => liveServer.once("listening", resolve));
  const { port } = liveServer.address();

  const { statusCode, location } = await new Promise((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port, path: "/" },
      (response) => {
        response.resume();
        resolve({
          statusCode: response.statusCode,
          location: response.headers.location,
        });
      }
    );
    request.on("error", reject);
  });

  assert.equal(statusCode, 301);
  assert.match(location, /\/puzzle$/);
});
