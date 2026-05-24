import { firmwareGcsPathPrefix } from './firmware-gcs-path.js';

/**
 * DB CHECK constraint regex (tightened: prerelease must start with an alphanumeric char):
 * ^firmware/[a-z0-9_-]+/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9][a-zA-Z0-9.]*)?/[A-Za-z0-9._-]+\.bin$
 */
const GCS_PATH_CONSTRAINT =
  /^firmware\/[a-z0-9_-]+\/[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9][a-zA-Z0-9.]*)?\/[A-Za-z0-9._-]+\.bin$/;

/** Mirrors the inline path template in UploadFirmwareCommand.run() */
function buildGcsPath(
  board: string,
  version: string,
  filename: string,
): string {
  return `${firmwareGcsPathPrefix(board)}${version}/${filename}`;
}

describe('firmwareGcsPathPrefix', () => {
  it('returns correct prefix for esp32c3', () => {
    expect(firmwareGcsPathPrefix('esp32c3')).toBe('firmware/esp32c3/');
  });

  it('returns correct prefix for esp32c6', () => {
    expect(firmwareGcsPathPrefix('esp32c6')).toBe('firmware/esp32c6/');
  });
});

describe('buildGcsPath — stable versions', () => {
  it('1.0.0 produces a path that satisfies the DB CHECK constraint', () => {
    const path = buildGcsPath('esp32c3', '1.0.0', 'esp32c3-v1.0.0.bin');

    expect(path).toBe('firmware/esp32c3/1.0.0/esp32c3-v1.0.0.bin');
    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });

  it('2.3.11 produces a valid path', () => {
    const path = buildGcsPath('esp32c6', '2.3.11', 'esp32c6-v2.3.11.bin');

    expect(path).toBe('firmware/esp32c6/2.3.11/esp32c6-v2.3.11.bin');
    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });
});

describe('buildGcsPath — prerelease versions pass through unchanged', () => {
  it('0.2.0-beta.1 is embedded verbatim in the path', () => {
    const path = buildGcsPath(
      'esp32c3',
      '0.2.0-beta.1',
      'esp32c3-v0.2.0-beta.1.bin',
    );

    expect(path).toBe(
      'firmware/esp32c3/0.2.0-beta.1/esp32c3-v0.2.0-beta.1.bin',
    );
    expect(path).toContain('0.2.0-beta.1');
  });

  it('0.2.0-beta.1 path satisfies the relaxed DB CHECK constraint', () => {
    const path = buildGcsPath(
      'esp32c3',
      '0.2.0-beta.1',
      'esp32c3-v0.2.0-beta.1.bin',
    );

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });

  it('1.0.0-rc.2 is embedded verbatim in the path', () => {
    const path = buildGcsPath(
      'esp32c6',
      '1.0.0-rc.2',
      'esp32c6-v1.0.0-rc.2.bin',
    );

    expect(path).toBe('firmware/esp32c6/1.0.0-rc.2/esp32c6-v1.0.0-rc.2.bin');
    expect(path).toContain('1.0.0-rc.2');
  });

  it('1.0.0-rc.2 path satisfies the relaxed DB CHECK constraint', () => {
    const path = buildGcsPath(
      'esp32c6',
      '1.0.0-rc.2',
      'esp32c6-v1.0.0-rc.2.bin',
    );

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });

  it('3.0.0-alpha.1 path satisfies the relaxed DB CHECK constraint', () => {
    const path = buildGcsPath(
      'esp32c3',
      '3.0.0-alpha.1',
      'esp32c3-v3.0.0-alpha.1.bin',
    );

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });
});

describe('DB CHECK constraint — rejects invalid paths', () => {
  it('rejects bare dot after hyphen in prerelease (firmware/esp32c3/0.2.0-./esp32c3-0.2.0.bin)', () => {
    const path = 'firmware/esp32c3/0.2.0-./esp32c3-0.2.0.bin';

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(false);
  });

  it('rejects empty prerelease after hyphen (firmware/esp32c3/0.2.0-/esp32c3-0.2.0.bin)', () => {
    const path = 'firmware/esp32c3/0.2.0-/esp32c3-0.2.0.bin';

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(false);
  });

  it('rejects path traversal attempt (firmware/../escape/1.0.0/esp32c3-1.0.0.bin)', () => {
    const path = 'firmware/../escape/1.0.0/esp32c3-1.0.0.bin';

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(false);
  });

  it('rejects uppercase board segment (firmware/ESP32C3/1.0.0/esp32c3-1.0.0.bin)', () => {
    const path = 'firmware/ESP32C3/1.0.0/esp32c3-1.0.0.bin';

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(false);
  });

  it('rejects non-.bin extension (firmware/esp32c3/1.0.0/firmware.exe)', () => {
    const path = 'firmware/esp32c3/1.0.0/firmware.exe';

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(false);
  });
});

describe('DB CHECK constraint — old constraint rejects prerelease (documents the bug)', () => {
  /** Original constraint — no optional prerelease group */
  const OLD_CONSTRAINT =
    /^firmware\/[a-z0-9_-]+\/[0-9]+\.[0-9]+\.[0-9]+\/[A-Za-z0-9._-]+\.bin$/;

  it('old constraint rejects 0.2.0-beta.1 path (the bug)', () => {
    const path = buildGcsPath(
      'esp32c3',
      '0.2.0-beta.1',
      'esp32c3-v0.2.0-beta.1.bin',
    );

    expect(OLD_CONSTRAINT.test(path)).toBe(false);
  });

  it('new constraint accepts 0.2.0-beta.1 path (the fix)', () => {
    const path = buildGcsPath(
      'esp32c3',
      '0.2.0-beta.1',
      'esp32c3-v0.2.0-beta.1.bin',
    );

    expect(GCS_PATH_CONSTRAINT.test(path)).toBe(true);
  });
});
