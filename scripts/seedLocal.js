const fs = require("fs/promises");
const path = require("path");
const { insertPuzzleToDb } = require("../repositories/puzzleRepository");
const { normalizePuzzle } = require("../utilities/puzzleFormatter");
const { runDbScript } = require("./runDbScript");
const { logger } = require("../utilities/logger");

const DATA_DIR = path.resolve(__dirname, "../data");

const readPuzzleFiles = async () => {
  try {
    const files = await fs.readdir(DATA_DIR);
    return files.filter((file) => file.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const loadPuzzle = async (fileName) => {
  const filePath = path.join(DATA_DIR, fileName);
  const contents = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  return normalizePuzzle(parsed);
};

const seed = async () => {
  const files = await readPuzzleFiles();

  if (!files.length) {
    logger.info("No local puzzle files found to seed");
    return;
  }

  for (const fileName of files) {
    try {
      const puzzle = await loadPuzzle(fileName);

      if (!puzzle || !puzzle.puzzleId) {
        logger.warn("Skipping invalid puzzle file", { fileName });
        continue;
      }

      await insertPuzzleToDb({
        puzzleId: puzzle.puzzleId,
        puzzle: puzzle.puzzle,
        keyPeople: puzzle.keyPeople,
      });
      logger.info("Seeded puzzle", { puzzleId: puzzle.puzzleId, fileName });
    } catch (error) {
      logger.error("Failed to seed puzzle file", { fileName, error });
    }
  }
};

if (require.main === module) {
  runDbScript("Seeding", seed);
}

module.exports = { readPuzzleFiles, loadPuzzle, seed };
