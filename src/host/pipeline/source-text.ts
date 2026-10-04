/**
 * Source text normalization for every string that arrives from an external data source.
 *
 * Tender notices, enterprise names and provider free text are untrusted input: they may carry
 * terminal control sequences, Unicode format characters or fence-forging sentinels. Host code
 * therefore ingests them through {@link sanitizeSourceText} exactly once, at the pipeline
 * boundary, and only ever handles normalized text afterwards.
 *
 * @module
 */

/** Upper bound for one raw provider string, shared with the adapter schemas. */
export const SOURCE_TEXT_LIMIT = 32_768

/** Upper bound for one diagnostic preview of a rejected provider record. */
export const SOURCE_PREVIEW_LIMIT = 2_048

/** Line separators collapse to a single space: one field never smuggles another line. */
const LINE_SEPARATOR = /[\t\n\r\u2028\u2029\v\f]+/gu

/** Remaining control (Cc), format (Cf), surrogate (Cs) and private-use (Co) code points. */
const INVISIBLE_CODE_POINT = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu

/**
 * Normalize one untrusted provider string: collapse line separators, drop invisible code points,
 * and keep the text otherwise byte-faithful (no trimming, so non-empty checks stay meaningful).
 */
export function sanitizeSourceText(value: string): string {
  return value.replaceAll(LINE_SEPARATOR, ' ').replaceAll(INVISIBLE_CODE_POINT, '')
}

/** Normalize a provider value for diagnostics, bounded to {@link SOURCE_PREVIEW_LIMIT}. */
export function previewSourceValue(value: unknown): string {
  let serialized: string
  try {
    const json = JSON.stringify(value)
    serialized = json === undefined ? String(value) : json
  } catch {
    return '[unserializable source value]'
  }
  const sanitized = sanitizeSourceText(serialized)
  return sanitized.length <= SOURCE_PREVIEW_LIMIT
    ? sanitized
    : `${sanitized.slice(0, SOURCE_PREVIEW_LIMIT - 1)}…`
}
