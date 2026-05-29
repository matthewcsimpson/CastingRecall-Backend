require("dotenv").config({ quiet: true });
const { Pool } = require("pg");
const { logger } = require("./logger");

let pool = null;

/**
 * Close the PostgreSQL pool.
 * @returns
 */
const closePool = async () => {
  if (!pool) {
    return;
  }

  try {
    await pool.end();
  } catch (error) {
    logger.error("Error shutting down PostgreSQL pool", { error });
  } finally {
    pool = null;
  }
};

/**
 * Build the PostgreSQL pool configuration.
 * @returns
 */
const buildPoolConfig = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
  }

  const config = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  };

  if (process.env.NODE_ENV === "production") {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
};

/**
 * Create a new PostgreSQL pool.
 * @returns
 */
const createPool = () => {
  const newPool = new Pool(buildPoolConfig());

  newPool.on("error", (err) => {
    logger.error("Unexpected PostgreSQL client error", { error: err });
  });

  return newPool;
};

/**
 * Get the PostgreSQL pool.
 * @returns
 */
const initializePool = async () => {
  if (!pool) {
    pool = createPool();
    await pool.query("SELECT 1");
  }

  return pool;
};

/**
 * Get the PostgreSQL pool.
 * @returns
 */
const getPool = () => {
  if (!pool) {
    pool = createPool();
  }

  return pool;
};

/**
 * Execute a query against the PostgreSQL database.
 * @param {*} text
 * @param {*} params
 * @returns
 */
const query = (text, params) => {
  return getPool().query(text, params);
};

/** */
const withClient = async (callback) => {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
};

module.exports = {
  getPool,
  query,
  withClient,
  closePool,
  initializePool,
};
