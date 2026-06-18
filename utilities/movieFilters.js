const { parseNumberWithDefault } = require("./numberUtils");

const LOWEST_YEAR = parseNumberWithDefault(process.env.LOWEST_YEAR, 1980);
const EXCLUDED_GENRES = [99, 10770];

const hasExcludedGenre = (genreIds) =>
  Array.isArray(genreIds) &&
  genreIds.some((genreId) =>
    EXCLUDED_GENRES.includes(parseNumberWithDefault(genreId, null))
  );

const getReleaseYear = (movie) => {
  const releaseDate = movie?.release_date;
  if (typeof releaseDate !== "string" || releaseDate.length < 4) {
    return null;
  }

  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const isWithinYearBounds = (movie, currentYear = new Date().getFullYear()) => {
  const releaseYear = getReleaseYear(movie);
  if (releaseYear === null) {
    return false;
  }

  return releaseYear >= LOWEST_YEAR && releaseYear <= currentYear;
};

const isEligibleMovie = (movie, options = {}) => {
  if (!movie) {
    return false;
  }

  const {
    enforceYearBounds = false,
    disallowedIds = new Set(),
    currentYear = new Date().getFullYear(),
  } = options;

  if (disallowedIds.has(movie.id)) {
    return false;
  }

  if (!Array.isArray(movie.genre_ids) || hasExcludedGenre(movie.genre_ids)) {
    return false;
  }

  if (!enforceYearBounds) {
    return true;
  }

  return isWithinYearBounds(movie, currentYear);
};

module.exports = {
  getReleaseYear,
  isWithinYearBounds,
  hasExcludedGenre,
  isEligibleMovie,
  LOWEST_YEAR,
};
