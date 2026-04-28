/**
 * Normalizes a PEM private key string by converting escaped newline sequences
 * (literal `\n` / `\r\n`) into real newline characters.
 *
 * JSON serialization or env-var interpolation can produce two-char escape sequences
 * instead of real newlines. OpenSSL 3 rejects PEM blocks with corrupted line breaks.
 */
export function normalizePemKey(raw: string): string {
  return raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}
