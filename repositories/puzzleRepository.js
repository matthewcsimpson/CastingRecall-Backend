const { query } = require("../utilities/db");
const { logger } = require("../utilities/logger");

// Shared column projection for puzzle reads. Static identifier list (never
// user input), kept in one place so a column add/rename stays consistent
// across every read query below.
const PUZZLE_COLUMNS = "puzzle_id, puzzle, key_people, created_at";

/**
 * @typedef {Object} PuzzleRecord
 * @property {number} puzzleId
 * @property {unknown[]} puzzle
 * @property {string[]} keyPeople
 * @property {string|Date|null} createdAt
 */

/**
 * Map a database row to a puzzle object.
 * @param {{ puzzle_id: number, puzzle?: string|unknown[], key_people?: string[]|null, created_at?: string|Date|null }|null} row Database row.
 * @returns {PuzzleRecord|null}
 */
const mapPuzzleRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    puzzleId: Number(row.puzzle_id),
    puzzle: (() => {
      if (typeof row.puzzle === "string") {
        if (!row.puzzle.length) {
          return [];
        }
        try {
          return JSON.parse(row.puzzle);
        } catch (error) {
          logger.error("Unable to parse stored puzzle JSON", { error });
          return [];
        }
      }
      return row.puzzle || [];
    })(),
    keyPeople: Array.isArray(row.key_people) ? row.key_people : [],
    createdAt: row.created_at,
  };
};

/**
 * Insert or update a puzzle record.
 * @param {{ puzzleId: number, puzzle?: unknown[], keyPeople?: string[] }} params Puzzle payload.
 * @returns {Promise<void>}
 */
const insertPuzzleToDb = async ({ puzzleId, puzzle, keyPeople }) => {
  const serializedPuzzle = JSON.stringify(puzzle ?? []);
  const normalizedKeyPeople = Array.isArray(keyPeople) ? keyPeople : [];

  try {
    await query(
      `
        INSERT INTO puzzles (puzzle_id, puzzle, key_people)
        VALUES ($1, $2::jsonb, $3::text[])
        ON CONFLICT (puzzle_id)
        DO UPDATE SET puzzle = EXCLUDED.puzzle, key_people = EXCLUDED.key_people
      `,
      [puzzleId, serializedPuzzle, normalizedKeyPeople]
    );
  } catch (error) {
    logger.error("Failed to persist puzzle", {
      puzzleId,
      keyPeople: normalizedKeyPeople,
      error,
    });
    throw error;
  }
};

/**
 * List all puzzles ordered by most recent identifiers.
 * @returns {Promise<PuzzleRecord[]>}
 */
const listPuzzlesFromDb = async () => {
  const result = await query(
    `
      SELECT ${PUZZLE_COLUMNS}
      FROM puzzles
      ORDER BY puzzle_id DESC
    `
  );

  return result.rows.map((row) => mapPuzzleRow(row));
};

/**
 * Get the most recently created puzzle.
 * @returns {Promise<PuzzleRecord|null>}
 */
const getLatestPuzzleFromDb = async () => {
  const result = await query(
    `
      SELECT ${PUZZLE_COLUMNS}
      FROM puzzles
      ORDER BY puzzle_id DESC
      LIMIT 1
    `
  );

  if (!result.rows.length) {
    return null;
  }

  return mapPuzzleRow(result.rows[0]);
};

/**
 * Get a puzzle by its ID.
 * @param {number} puzzleId Puzzle identifier.
 * @returns {Promise<PuzzleRecord|null>}
 */
const getPuzzleByIdFromDb = async (puzzleId) => {
  const result = await query(
    `
      SELECT ${PUZZLE_COLUMNS}
      FROM puzzles
      WHERE puzzle_id = $1
      LIMIT 1
    `,
    [puzzleId]
  );

  if (!result.rows.length) {
    return null;
  }

  return mapPuzzleRow(result.rows[0]);
};

module.exports = {
  insertPuzzleToDb,
  listPuzzlesFromDb,
  getLatestPuzzleFromDb,
  getPuzzleByIdFromDb,
};
