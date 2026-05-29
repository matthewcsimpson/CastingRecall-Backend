const { makePuzzle } = require("../utilities/makePuzzle");
const { normalizePuzzle } = require("../utilities/puzzleFormatter");
const {
  insertPuzzleToDb,
  listPuzzlesFromDb,
  getLatestPuzzleFromDb,
  getPuzzleByIdFromDb,
} = require("../repositories/puzzleRepository");
const { parseIntWithDefault } = require("../utilities/numberUtils");
const { logger } = require("../utilities/logger");

const MAX_GENERATION_ATTEMPTS = parseIntWithDefault(
  process.env.MAX_GENERATION_ATTEMPTS,
  3
);

/**
 * Normalize a stored puzzle record and send it as the response, or a 500
 * when the stored payload cannot be normalized.
 * @param {object} res
 * @param {{puzzleId: number, puzzle: unknown[], keyPeople: string[]}} record
 * @returns {object}
 */
const sendNormalizedPuzzle = (res, record) => {
  const puzzle = normalizePuzzle({
    puzzleId: record.puzzleId,
    puzzle: record.puzzle,
    keyPeople: record.keyPeople,
  });

  if (!puzzle) {
    return res.status(500).json({ message: "Stored puzzle is invalid" });
  }

  return res.status(200).json(puzzle);
};

/**
 * Endpoint controller to generate a new puzzle.
 * @param {object} req
 * @param {object} res
 */
exports.generatePuzzle = async (req, res) => {
  const generationKey = process.env.GENERATION_KEY;

  if (!generationKey) {
    logger.error("generatePuzzle: GENERATION_KEY not configured");
    return res.status(500).json({ message: "Puzzle generation unavailable" });
  }

  const authHeader = req.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ message: "Missing generation key" });
  }

  const suppliedKey = authHeader.substring("Bearer ".length).trim();

  if (suppliedKey !== generationKey) {
    return res.status(403).json({ message: "Invalid generation key" });
  }

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_GENERATION_ATTEMPTS) {
    try {
      const puzzle = await makePuzzle();
      await insertPuzzleToDb({
        puzzleId: puzzle.puzzleId,
        puzzle: puzzle.puzzle,
        keyPeople: puzzle.keyPeople,
      });
      return res.send("puzzle made!");
    } catch (err) {
      lastError = err;
      attempt += 1;

      if (err?.isExternalServiceError) {
        logger.warn("generatePuzzle attempt failed (external service)", {
          attempt,
          message: err.message,
        });
      } else {
        logger.error("generatePuzzle attempt failed", { attempt, error: err });
      }
    }
  }

  if (lastError?.isExternalServiceError) {
    return res.status(502).json({ message: lastError.message });
  }

  return res.status(500).json({ message: "Unable to generate puzzle" });
};

/**
 * Endpoint controller to return a list of puzzles.
 * @param {object} req
 * @param {object} res
 */
exports.listPuzzles = async (req, res) => {
  try {
    const puzzles = await listPuzzlesFromDb();

    return res.status(200).json({ puzzles });
  } catch (err) {
    logger.error("listPuzzles failed", { error: err });
    return res.status(500).json({ message: "Unable to list puzzles" });
  }
};

/**
 * Endpoint controller to return the most recently generated puzzle.
 * @param {object} req
 * @param {object} res
 */
exports.getLatestPuzzle = async (_req, res) => {
  try {
    const latest = await getLatestPuzzleFromDb();

    if (!latest) {
      return res.status(204).send("no puzzles available");
    }

    return sendNormalizedPuzzle(res, latest);
  } catch (err) {
    logger.error("getLatestPuzzle failed", { error: err });
    return res.status(500).json({ message: "Unable to load latest puzzle" });
  }
};

/**
 * Endpoint controller to return a specific puzzle by its ID.
 * @param {object} req
 * @param {object} res
 */
exports.getPuzzleById = async (req, res) => {
  const { puzzleid } = req.params;
  const puzzleId = Number(puzzleid);

  // puzzle_id is a positive BIGINT; reject NaN, floats, and non-positive ids
  // rather than letting them coerce (e.g. "1.5" -> 1.5, " " -> 0) into a query.
  if (!Number.isInteger(puzzleId) || puzzleId < 1) {
    return res.status(400).json({ message: "Invalid puzzle id" });
  }

  try {
    const record = await getPuzzleByIdFromDb(puzzleId);

    if (!record) {
      return res.status(404).json({ message: "Puzzle not found" });
    }

    return sendNormalizedPuzzle(res, record);
  } catch (err) {
    logger.error("getPuzzleById failed", { error: err });
    return res.status(500).json({ message: "Unable to load puzzle" });
  }
};
