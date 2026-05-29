// Minimal structured logger.
//
// Emits one JSON object per line (level, time, message, optional context) so
// logs are queryable on Heroku instead of ad-hoc concatenated strings. Levels
// delegate to the matching `console` method, so existing test suppression of
// `console.error` / `console.log` continues to work, and Heroku still captures
// stdout/stderr as before.

/**
 * Convert an Error into a plain, JSON-serializable shape. `JSON.stringify`
 * renders an Error as `{}` (its fields are non-enumerable), which would drop
 * the message and stack — so we extract them explicitly.
 * @param {unknown} value
 * @returns {unknown}
 */
const serializeError = (value) =>
  value instanceof Error
    ? {
        name: value.name,
        message: value.message,
        stack: value.stack,
        ...(value.cause !== undefined ? { cause: String(value.cause) } : {}),
      }
    : value;

const replacer = (_key, value) => serializeError(value);

/**
 * @param {"info"|"warn"|"error"} level
 * @param {string} message
 * @param {unknown} [context] Optional structured context (objects, errors, etc).
 */
const emit = (level, message, context) => {
  const entry = { level, time: new Date().toISOString(), message };
  if (context !== undefined) {
    entry.context = context;
  }

  const line = JSON.stringify(entry, replacer);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    // `info` maps to console.log so existing `console.log` test suppression
    // and Heroku's stdout capture both keep working.
    console.log(line);
  }
};

const logger = {
  /** @param {string} message @param {unknown} [context] */
  info: (message, context) => emit("info", message, context),
  /** @param {string} message @param {unknown} [context] */
  warn: (message, context) => emit("warn", message, context),
  /** @param {string} message @param {unknown} [context] */
  error: (message, context) => emit("error", message, context),
};

module.exports = { logger };
