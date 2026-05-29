require("dotenv").config();

/**
 * @typedef {import("axios").AxiosResponse<any>} AxiosResponse
 * @typedef {{ id?: number|null, name?: string|null, original_name?: string|null, fullName?: string|null, character?: string|null, profile_path?: string|null, order?: number|null }} TMDBPerson
 * @typedef {{ id?: number|null, title?: string|null, name?: string|null, original_title?: string|null, original_name?: string|null, poster_path?: string|null, release_date?: string|null, overview?: string|null, genre_ids?: Array<number|string>, keyPerson?: TMDBPerson|null, cast?: TMDBPerson[], directors?: TMDBPerson[] }} TMDBMovie
 * @typedef {{ cast: TMDBPerson[], crew: TMDBPerson[] }} TMDBCredits
 * @typedef {Error & { statusCode: number, isExternalServiceError: true, cause?: unknown, rateLimitReset?: string|null }} ExternalServiceError
 * @typedef {TMDBMovie & { keyPerson: TMDBPerson|null, cast: TMDBPerson[], directors: TMDBPerson[] }} PuzzleMovie
 */

const { parseNumberWithDefault } = require("./numberUtils");
const { buildNormalizedMovie, deriveKeyPeople } = require("./puzzleFormatter");
const {
  createExternalServiceError,
  tmdbClient,
  buildCreditsUrl,
  buildDiscoverUrl: buildBaseDiscoverUrl,
} = require("./tmdbClient");
const { isEligibleMovie, LOWEST_YEAR } = require("./movieFilters");
const { getRandomNumberUpToInt, getRandomActor } = require("./randomUtils");

const CURRENT_YEAR = new Date().getFullYear();
const MAX_RETRIES = parseNumberWithDefault(process.env.MAX_RETRIES, 2);
const RETRY_DELAY_MS = parseNumberWithDefault(process.env.RETRY_DELAY_MS, 300);
const CREDITS_CACHE_MAX = parseNumberWithDefault(
  process.env.CREDITS_CACHE_MAX,
  100
);
const SHORT_FILM_MIN_RUNTIME = parseNumberWithDefault(
  process.env.SHORT_FILM_MIN_RUNTIME,
  40
);
const MIN_VOTE_COUNT = parseNumberWithDefault(process.env.MIN_VOTE_COUNT, 350);
const MIN_VOTE_AVERAGE = parseNumberWithDefault(
  process.env.MIN_VOTE_AVERAGE,
  6
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// In-memory cache for movie credits
const creditsCache = new Map();

/**
 * Build TMDB discover URL with parameters.
 * @param {Record<string, string|number|boolean>} extraParams
 * @returns {string}
 */
const buildDiscoverUrl = (extraParams = {}) =>
  buildBaseDiscoverUrl({
    include_adult: "false",
    region: "US",
    language: "en-US",
    page: "1",
    sort_by: "popularity.desc",
    "with_runtime.gte": String(SHORT_FILM_MIN_RUNTIME),
    with_original_language: "en",
    "vote_count.gte": String(MIN_VOTE_COUNT),
    "vote_average.gte": String(MIN_VOTE_AVERAGE),
    ...extraParams,
  });

/**
 * Fetch with retry logic for transient errors.
 * @param {string} url
 * @param {number} [retries]
 * @returns {Promise<AxiosResponse>}
 */
const fetchWithRetry = async (url, retries = MAX_RETRIES) => {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await tmdbClient.get(url);
    } catch (error) {
      const status = error?.response?.status;

      if (status === 404) {
        throw createExternalServiceError("TMDB resource not found", error);
      }

      if (attempt >= retries || (status && status < 500)) {
        if (status === 429) {
          error.rateLimitReset =
            error?.response?.headers?.["retry-after"] || null;
        }
        throw error;
      }

      attempt += 1;
      const backoffDelay = RETRY_DELAY_MS * 2 ** (attempt - 1);
      await delay(backoffDelay);
    }
  }
};

/**
 * Get movie credits, utilizing in-memory caching.
 * @param {number|string|null} movieId
 * @returns {Promise<TMDBCredits>}
 */
const getCredits = async (movieId) => {
  if (!movieId) {
    return { cast: [], crew: [] };
  }

  if (creditsCache.has(movieId)) {
    const cached = creditsCache.get(movieId);
    creditsCache.delete(movieId);
    creditsCache.set(movieId, cached);
    return cached;
  }

  const response = await fetchWithRetry(buildCreditsUrl(movieId));
  const credits = response?.data ?? { cast: [], crew: [] };
  if (creditsCache.size >= CREDITS_CACHE_MAX) {
    const oldestKey = creditsCache.keys().next().value;
    creditsCache.delete(oldestKey);
  }
  creditsCache.set(movieId, credits);
  return credits;
};

/**
 * Get a movie from a random year.
 * @param {number} year
 * @returns {Promise<TMDBMovie|null>}
 */
const getMovieFromRandomYear = async (year) => {
  const url = buildDiscoverUrl({ primary_release_year: year });
  const response = await fetchWithRetry(url);
  const results = response?.data?.results ?? [];

  const filtered = results.filter((movie) => isEligibleMovie(movie));

  if (filtered.length === 0) {
    return null;
  }

  return filtered[getRandomNumberUpToInt(filtered.length)] ?? null;
};

/**
 * Fetch a movie's credits and return the truthy entries from one field
 * that match a predicate, optionally capped at a limit.
 * @param {number|string|null} movieId
 * @param {"cast"|"crew"} field
 * @param {(entry: TMDBPerson) => boolean} predicate
 * @param {number} [limit] Optional cap on the number of returned entries.
 * @returns {Promise<TMDBPerson[]>}
 */
const selectFromCredits = async (movieId, field, predicate, limit) => {
  const credits = await getCredits(movieId);
  const entries = Array.isArray(credits[field]) ? credits[field] : [];
  const filtered = entries.filter((entry) => entry && predicate(entry));
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
};

/**
 * Get the primary cast members for a movie.
 * @param {number|string|null} movieId
 * @returns {Promise<TMDBPerson[]>}
 */
const getPrimaryCast = (movieId) =>
  selectFromCredits(movieId, "cast", (actor) => actor.order < 5, 5);

/**
 * Get supporting cast members for a movie, excluding previous cast.
 * @param {number|string|null} movieId
 * @param {TMDBPerson[]} [previousCast]
 * @returns {Promise<TMDBPerson[]>}
 */
const getSupportingCast = (movieId, previousCast = []) => {
  const excludeIds = new Set(
    previousCast.filter(Boolean).map((actor) => actor.id)
  );

  return selectFromCredits(
    movieId,
    "cast",
    (actor) => !excludeIds.has(actor.id),
    5
  );
};

/**
 * Get directors for a movie.
 * @param {number|string|null} movieId
 * @returns {Promise<TMDBPerson[]>}
 */
const getDirectors = (movieId) =>
  selectFromCredits(
    movieId,
    "crew",
    (crewMember) =>
      typeof crewMember.job === "string" &&
      crewMember.job.toLowerCase() === "director"
  );

/**
 * Get a movie by actor ID, excluding already selected movies.
 * @param {number|string|null} actorId
 * @param {TMDBMovie[]} movies
 * @returns {Promise<TMDBMovie|null>}
 */
const getMovieByActorID = async (actorId, movies) => {
  if (!actorId) {
    return null;
  }

  const movieIds = new Set((movies || []).map((movie) => movie.id));
  const url = buildDiscoverUrl({ with_cast: actorId });
  const response = await fetchWithRetry(url);
  const results = response?.data?.results ?? [];

  const filtered = results.filter((movie) =>
    isEligibleMovie(movie, {
      enforceYearBounds: true,
      disallowedIds: movieIds,
    })
  );

  if (filtered.length === 0) {
    return null;
  }

  const selectionPool = filtered.slice(0, Math.min(filtered.length, 5));
  return selectionPool[getRandomNumberUpToInt(selectionPool.length)] ?? null;
};

/**
 * Combine movie and credit metadata into a puzzle entry.
 * @param {TMDBMovie} movie
 * @param {TMDBPerson[]} cast
 * @param {TMDBPerson[]} directors
 * @param {TMDBPerson|null} keyPerson
 * @returns {PuzzleMovie}
 */
const createPuzzleMovie = (movie, cast, directors, keyPerson) => ({
  ...movie,
  cast,
  directors,
  keyPerson,
});

/**
 * Generate a new puzzle.
 * @returns {Promise<{ puzzleId: number, puzzle: ReturnType<typeof buildNormalizedMovie>[], keyPeople: string[] }>}
 */
const makePuzzle = async () => {
  try {
    const randomYear = Math.floor(
      Math.random() * (CURRENT_YEAR - LOWEST_YEAR) + LOWEST_YEAR
    );

    const tempArray = [];
    const puzzleLength = 6;

    const seedMovie = await getMovieFromRandomYear(randomYear);

    if (!seedMovie) {
      throw createExternalServiceError(
        "TMDB returned no seed movies for the selected year."
      );
    }

    const [seedCast, seedDirectors] = await Promise.all([
      getPrimaryCast(seedMovie.id),
      getDirectors(seedMovie.id),
    ]);

    if (!seedCast.length) {
      throw createExternalServiceError("Seed movie did not include cast data.");
    }

    const seedKeyPerson = getRandomActor(seedCast) ?? seedCast[0];

    tempArray.push(
      createPuzzleMovie(seedMovie, seedCast, seedDirectors, seedKeyPerson)
    );

    while (tempArray.length < puzzleLength) {
      const previousMovie = tempArray[tempArray.length - 1];

      // Try linking via the previously selected actor first, then fall back to other cast members.
      const actorsToTry = [
        previousMovie.keyPerson,
        ...previousMovie.cast.filter(
          (actor) => actor && actor.id !== previousMovie.keyPerson?.id
        ),
      ].filter(Boolean);

      let nextMovie = null;
      const attemptedActorIds = new Set();

      for (const actor of actorsToTry) {
        if (attemptedActorIds.has(actor.id)) {
          continue;
        }
        attemptedActorIds.add(actor.id);
        nextMovie = await getMovieByActorID(actor.id, tempArray);
        if (nextMovie) {
          break;
        }
      }

      if (!nextMovie) {
        throw createExternalServiceError(
          "Unable to find a connected movie for the current cast."
        );
      }

      const [nextCast, nextDirectors] = await Promise.all([
        getSupportingCast(nextMovie.id, previousMovie.cast),
        getDirectors(nextMovie.id),
      ]);

      if (!nextCast.length) {
        throw createExternalServiceError(
          "Discovered movie did not include sufficient cast data."
        );
      }

      const nextKeyPerson = getRandomActor(nextCast) ?? nextCast[0];

      tempArray.push(
        createPuzzleMovie(nextMovie, nextCast, nextDirectors, nextKeyPerson)
      );
    }

    const timestamp = Date.now();
    const normalizedPuzzle = tempArray.map((movie) =>
      buildNormalizedMovie(movie)
    );
    const keyPeople = deriveKeyPeople(normalizedPuzzle);

    const newPuzzle = {
      puzzleId: timestamp,
      puzzle: normalizedPuzzle,
      keyPeople,
    };

    console.info("puzzle made");
    return newPuzzle;
  } catch (error) {
    if (error?.isExternalServiceError) {
      throw error;
    }

    throw createExternalServiceError("Failed to generate puzzle.", error);
  }
};

module.exports = { makePuzzle };
