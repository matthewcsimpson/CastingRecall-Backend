const { initializePool, closePool } = require("../utilities/db");

/**
 * Run a one-off database script with managed pool lifecycle.
 * Initializes the pool, runs the task, then always closes the pool and
 * exits with code 1 if the task or the close fails (0 otherwise).
 * @param {string} label Human-readable name used in the failure log (e.g. "Migration").
 * @param {() => Promise<void>} task The script body to run once the pool is ready.
 * @returns {Promise<void>}
 */
const runDbScript = async (label, task) => {
  let exitCode = 0;

  try {
    await initializePool();
    await task();
  } catch (error) {
    console.error(`${label} failed`, error);
    exitCode = 1;
  } finally {
    try {
      await closePool();
    } catch (closeError) {
      console.error("Failed to close database pool", closeError);
      exitCode = 1;
    }

    process.exit(exitCode);
  }
};

module.exports = { runDbScript };
