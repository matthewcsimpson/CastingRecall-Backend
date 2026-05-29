/**
 * Normalize a string input with optional trimming and null handling.
 * @param {*} value Raw value to normalize.
 * @param {{trim?: boolean, allowNull?: boolean, fallback?: string}} [options]
 * @returns {string|null} Normalized string or null when allowed.
 */
const normalizeString = (
  value,
  { trim = false, allowNull = false, fallback = "" } = {}
) => {
  if (typeof value !== "string") {
    return allowNull ? null : fallback;
  }

  const processed = trim ? value.trim() : value;

  if (!processed && trim) {
    return allowNull ? null : fallback;
  }

  return processed;
};

/**
 * Normalize to a trimmed string or empty string if invalid.
 * @param {*} value Input value.
 * @returns {string} Trimmed string value.
 */
const getTrimmedString = (value) => normalizeString(value, { trim: true });

/**
 * Normalize to a trimmed string or null when empty.
 * @param {*} value Input value.
 * @returns {string|null} Trimmed string or null.
 */
const getNullableTrimmedString = (value) =>
  normalizeString(value, { trim: true, allowNull: true, fallback: null });

/**
 * Normalize a list of people objects with a projector function.
 * @template T
 * @param {*} list Source list.
 * @param {(item: any) => T | null} projector Projector returning sanitized item or null.
 * @returns {T[]} Sanitized collection.
 */
const normalizePeople = (list, projector) => {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(projector).filter(Boolean);
};

/**
 * Normalize a list of TMDB genre IDs to numbers.
 * @param {*} ids Raw genre ID list.
 * @returns {number[]} Clean numeric IDs.
 */
const normalizeGenreIds = (ids) => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    })
    .filter((value) => value !== null);
};

/**
 * Resolve a person's display name from the first non-empty of name,
 * original_name, and (optionally) fullName.
 * @param {*} person Person-like object from a TMDB payload.
 * @param {{includeFullName?: boolean}} [options]
 * @returns {string} Trimmed display name, or "" when none present.
 */
const pickPersonName = (person, { includeFullName = true } = {}) =>
  getTrimmedString(person?.name) ||
  getTrimmedString(person?.original_name) ||
  (includeFullName ? getTrimmedString(person?.fullName) : "");

/**
 * Sanitize director data to id/name pairs.
 * @param {*} directors Raw director list.
 * @returns {{id: number|string|null, name: string}[]} Normalized directors.
 */
const sanitizeDirectors = (directors) => {
  return normalizePeople(directors, (director) => {
    const name = pickPersonName(director);

    if (!name) {
      return null;
    }

    return {
      id: director?.id ?? director?.personId ?? null,
      name,
    };
  });
};

/**
 * Sanitize cast entries to limited fields used by the client.
 * @param {*} cast Raw cast array.
 * @returns {{id: number|string|null, name: string, character: string, profile_path: string|null}[]} Normalized cast list.
 */
const sanitizeCast = (cast) => {
  return normalizePeople(cast, (actor) => {
    const name = pickPersonName(actor, { includeFullName: false });

    if (!name) {
      return null;
    }

    return {
      id: actor?.id ?? null,
      name,
      character: normalizeString(actor?.character),
      profile_path: getNullableTrimmedString(actor?.profile_path),
    };
  });
};

/**
 * Resolve the display name for the key person on a movie.
 * @param {*} keyPerson Key person object from TMDB payload.
 * @param {{name: string}[]} cast Normalized cast list.
 * @returns {string} Key person display name.
 */
const getKeyPersonName = (keyPerson, cast) => {
  const primaryName = pickPersonName(keyPerson);

  if (primaryName) {
    return primaryName;
  }

  const fallback = cast.find((actor) => Boolean(actor?.name));
  return fallback?.name ?? "";
};

/**
 * Normalize a movie entry into the backend contract format.
 * @param {*} movie Raw movie object.
 * @returns {{id: number|string|null, title: string, original_title: string, poster_path: string|null, release_date: string, overview: string, genre_ids: number[], directors: {id: number|string|null, name: string}[], cast: {id: number|string|null, name: string, character: string, profile_path: string|null}[], keyPerson: {name: string}}}
 */
const buildNormalizedMovie = (movie = {}) => {
  const sanitizedCast = sanitizeCast(movie?.cast);
  const sanitizedDirectors = sanitizeDirectors(movie?.directors);

  const title = getTrimmedString(movie?.title) || getTrimmedString(movie?.name);
  const originalTitle =
    getTrimmedString(movie?.original_title) ||
    title ||
    getTrimmedString(movie?.original_name);

  const normalized = {
    id: movie?.id ?? null,
    title,
    original_title: originalTitle,
    poster_path: getNullableTrimmedString(movie?.poster_path),
    release_date: getTrimmedString(movie?.release_date),
    overview: normalizeString(movie?.overview),
    genre_ids: normalizeGenreIds(movie?.genre_ids),
    directors: sanitizedDirectors,
    cast: sanitizedCast,
  };

  const keyPersonName = getKeyPersonName(movie?.keyPerson, sanitizedCast);
  normalized.keyPerson = { name: keyPersonName };

  return normalized;
};

/**
 * Normalize a stored puzzle payload into the response contract.
 * @param {*} rawPuzzle Raw puzzle object from disk or TMDB aggregation.
 * @returns {{puzzleId: number|string|null, puzzle: ReturnType<typeof buildNormalizedMovie>[], keyPeople: string[]}|null}
 */
const normalizePuzzle = (rawPuzzle) => {
  if (!rawPuzzle || typeof rawPuzzle !== "object") {
    return null;
  }

  const normalizedMovies = Array.isArray(rawPuzzle.puzzle)
    ? rawPuzzle.puzzle.map((movie) => buildNormalizedMovie(movie))
    : [];

  const derivedKeyPeople = normalizedMovies.map((movie) =>
    getTrimmedString(movie?.keyPerson?.name)
  );

  let keyPeople = Array.isArray(rawPuzzle.keyPeople)
    ? rawPuzzle.keyPeople.map((name) => getTrimmedString(name))
    : derivedKeyPeople;

  if (keyPeople.length !== derivedKeyPeople.length) {
    keyPeople = derivedKeyPeople;
  }

  return {
    puzzleId: rawPuzzle.puzzleId ?? rawPuzzle.id ?? null,
    puzzle: normalizedMovies,
    keyPeople,
  };
};

module.exports = {
  buildNormalizedMovie,
  normalizePuzzle,
};
