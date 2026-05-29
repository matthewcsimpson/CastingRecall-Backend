const express = require("express");
const router = express.Router();

const {
  generatePuzzle,
  listPuzzles,
  getLatestPuzzle,
  getPuzzleById,
} = require("../controllers/puzzleController");

/**
 * Generate a new puzzle.
 */
router.route("/generate").post(generatePuzzle);

/**
 * Return a list of available puzzles
 */
router.route("/list").get(listPuzzles);

/**
 * Return the latest puzzle.
 */
router.route("/latest").get(getLatestPuzzle);

/**
 * Return a specific puzzle but its puzzle id.
 */
router.route("/:puzzleid").get(getPuzzleById);

/**
 * Return the latest puzzle.
 */
router.route("/").get(getLatestPuzzle);

module.exports = router;
