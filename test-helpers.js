// Shared test utilities for the node:test suite.
//
// The app is CommonJS with dependencies wired via top-level `require`, so a
// module captures its collaborators at load time. To unit-test a module in
// isolation we seed `require.cache` with a stub *before* requiring the module
// under test — any subsequent `require` of that path returns the stub instead
// of loading the real file. This keeps tests free of a database, network, or a
// third-party test framework.
//
// Note: `node --test` runs each test file in its own process, so cache changes
// made here never leak across files.

/**
 * Seed require.cache for an already-resolved module path with `exports`.
 * @param {string} resolvedPath Absolute path from `require.resolve(...)`.
 * @param {unknown} exports The stub module exports.
 */
const mockModule = (resolvedPath, exports) => {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };
};

/**
 * Remove modules from require.cache so the next require reloads them fresh.
 * @param {...string} resolvedPaths Absolute module paths to evict.
 */
const unmock = (...resolvedPaths) => {
  for (const resolvedPath of resolvedPaths) {
    delete require.cache[resolvedPath];
  }
};

/**
 * Build a minimal Express-style response double that records what the
 * controller did to it. Methods are chainable, mirroring Express.
 * @returns {{statusCode: number|null, body: unknown, sent: boolean, headers: object, location: string|null, ended: boolean, status: Function, json: Function, send: Function, writeHead: Function, end: Function}}
 */
const createMockResponse = () => {
  const res = {
    statusCode: 200, // Express defaults to 200 until status()/writeHead() is called
    body: undefined,
    sent: false,
    headers: {},
    location: null,
    ended: false,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    res.sent = true;
    return res;
  };
  res.send = (payload) => {
    res.body = payload;
    res.sent = true;
    return res;
  };
  res.writeHead = (code, headers = {}) => {
    res.statusCode = code;
    res.headers = headers;
    res.location = headers.Location ?? null;
    return res;
  };
  res.end = () => {
    res.ended = true;
    res.sent = true;
    return res;
  };

  return res;
};

/**
 * Build an Express-style request double.
 * @param {{headers?: object, params?: object}} [options]
 * @returns {{params: object, get: Function}}
 */
const createMockRequest = ({ headers = {}, params = {} } = {}) => {
  const lowerCased = {};
  for (const [key, value] of Object.entries(headers)) {
    lowerCased[key.toLowerCase()] = value;
  }

  return {
    params,
    headers: lowerCased, // Express lower-cases header keys
    originalUrl: "/",
    get: (name) => lowerCased[String(name).toLowerCase()],
  };
};

module.exports = {
  mockModule,
  unmock,
  createMockResponse,
  createMockRequest,
};
