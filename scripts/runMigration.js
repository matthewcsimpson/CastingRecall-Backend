const fs = require("fs/promises");
const path = require("path");
const { withClient } = require("../utilities/db");
const { runDbScript } = require("./runDbScript");
require("dotenv").config({ quiet: true });

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const loadAppliedMigrations = async (client) => {
  const result = await client.query("SELECT file_name FROM schema_migrations");
  return new Set(result.rows.map((row) => row.file_name));
};

const applyMigration = async (client, fileName, sql) => {
  let committed = false;
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (file_name) VALUES ($1)",
      [fileName]
    );
    await client.query("COMMIT");
    committed = true;
    console.info(`Applied migration: ${fileName}`);
  } catch (error) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to rollback migration", rollbackError);
      }
    }
    throw error;
  }
};

const run = async () => {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrations = files.filter((file) => file.endsWith(".sql")).sort();

  if (!migrations.length) {
    console.info("No migrations found");
    return;
  }

  await withClient(async (client) => {
    await ensureMigrationsTable(client);
    const applied = await loadAppliedMigrations(client);

    for (const fileName of migrations) {
      if (applied.has(fileName)) {
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, fileName);
      const sql = await fs.readFile(filePath, "utf8");
      await applyMigration(client, fileName, sql);
    }
  });
};

if (require.main === module) {
  runDbScript("Migration", run);
}

module.exports = {
  ensureMigrationsTable,
  loadAppliedMigrations,
  applyMigration,
  run,
};
