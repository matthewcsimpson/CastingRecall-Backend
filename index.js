// libraries
const express = require("express");
const cors = require("cors");
require("dotenv").config({ quiet: true });
const { initializePool, closePool } = require("./utilities/db");
const app = express();

app.use(express.json());
app.use(cors());

// variables
const PORT = process.env.PORT || 8080;
const puzzlerouter = require("./routes/puzzles");

/**
 * Log each incoming request, then continue down the middleware chain.
 */
const requestLogger = (req, _res, next) => {
  const timestamp = Date.now();
  console.log(`${timestamp} incoming request at ${req.originalUrl}`);
  next();
};

/**
 * Redirect the API root to the puzzle resource.
 */
const redirectToPuzzle = (req, res) => {
  res.writeHead(301, { Location: "http://" + req.headers["host"] + "/puzzle" });
  return res.end();
};

// Terminal error handler. Express 5 forwards rejections/throws from async
// route handlers here; the controllers also catch their own errors, so this
// is a backstop rather than the primary path.
const errorHandler = (err, _req, res, _next) => {
  console.error("Unhandled error", err);
  return res.status(500).json({ message: "Internal server error" });
};

// middleware
app.use(requestLogger);

app.use("/puzzle", puzzlerouter);

app.get("/", redirectToPuzzle);

app.use(errorHandler);

let server;
let isShuttingDown = false;

const startServer = async () => {
  try {
    await initializePool();
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
    server.on("error", (error) => {
      console.error("HTTP server error", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to initialize database pool", error);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully.`);

  const finalize = async (err) => {
    await closePool();
    process.exit(err ? 1 : 0);
  };

  if (server) {
    server.close(async (err) => {
      if (err) {
        console.error("Error closing HTTP server", err);
      }
      await finalize(err);
    });
  } else {
    await finalize();
  }
};

// Only wire signal handlers and start listening when run directly
// (`node index.js`). When required by a test, the app is exported without
// side effects.
if (require.main === module) {
  ["SIGTERM", "SIGINT"].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  startServer();
}

module.exports = {
  app,
  requestLogger,
  redirectToPuzzle,
  errorHandler,
  startServer,
  shutdown,
};
