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

// middleware
app.use((req, _res, next) => {
  let timestamp = Date.now();
  console.log(`${timestamp} incoming request at ${req.originalUrl}`);
  next();
});

app.use("/puzzle", puzzlerouter);

app.get("/", (req, res) => {
  res.writeHead(301, { Location: "http://" + req.headers["host"] + "/puzzle" });
  return res.end();
});

let server;
let isShuttingDown = false;

const startServer = async () => {
  try {
    await initializePool();
    server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
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

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

startServer();
