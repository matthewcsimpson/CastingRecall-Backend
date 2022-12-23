const express = require("express");
const fs = require("fs");
const router = express.Router();
router.use(express.json());

// imports
const {
  makePuzzle,
  trimFileNameFromString,
} = require("../utilities/makePuzzle");

const {
  generatePuzzle,
  listPuzzles,
  getLatestPuzzle,
  getPuzzleById,
} = require("../controllers/puzzleContoller");

/**
 * Generate a new puzzle.
 */
router.route("/generate").get(generatePuzzle);

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
