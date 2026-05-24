/**
 * Returns the expected GCS path prefix for a given boardType.
 * All firmware objects for a board are stored under `firmware/{boardType}/`.
 */
export function firmwareGcsPathPrefix(boardType: string): string {
  return `firmware/${boardType}/`;
}
