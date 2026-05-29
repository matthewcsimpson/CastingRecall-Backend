const axios = require("axios");
require("dotenv").config({ quiet: true });

const { parseNumberWithDefault } = require("./numberUtils");

const API_TOKEN = process.env.TMDB_API_TOKEN;
const TMDB_DISCOVER_URL = process.env.TMDB_DISCOVER_URL;
const TMDB_SEARCH_CREDITS_FRONT = process.env.TMDB_SEARCH_CREDITS_FRONT;
const TMDB_SEARCH_CREDITS_BACK = process.env.TMDB_SEARCH_CREDITS_BACK;
const TMDB_REQUEST_TIMEOUT_MS = parseNumberWithDefault(
  process.env.TMDB_REQUEST_TIMEOUT_MS,
  5000
);

const createExternalServiceError = (message, cause) => {
  const error = new Error(message);
  error.name = "ExternalServiceError";
  error.statusCode = 502;
  error.isExternalServiceError = true;
  if (cause) {
    error.cause = cause;
  }
  return error;
};

if (!API_TOKEN) {
  throw createExternalServiceError("TMDB API token not configured.");
}

if (!TMDB_SEARCH_CREDITS_FRONT || !TMDB_SEARCH_CREDITS_BACK) {
  throw createExternalServiceError(
    "TMDB credits URL fragments not configured."
  );
}

const tmdbClient = axios.create({
  baseURL: "https://api.themoviedb.org/3",
  timeout: TMDB_REQUEST_TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    Accept: "application/json",
  },
});

const buildCreditsUrl = (movieId) =>
  `${TMDB_SEARCH_CREDITS_FRONT}${movieId}${TMDB_SEARCH_CREDITS_BACK}`;

const buildDiscoverUrl = (params = {}) => {
  if (!TMDB_DISCOVER_URL) {
    throw createExternalServiceError("TMDB discover URL not configured.");
  }

  const url = new URL(TMDB_DISCOVER_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

module.exports = {
  createExternalServiceError,
  tmdbClient,
  buildCreditsUrl,
  buildDiscoverUrl,
};
