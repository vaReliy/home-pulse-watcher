import { Reflector } from '@nestjs/core';
import { DeviceStatusController } from '../controllers/device-status/device-status.controller.js';
import { OtaController } from '../controllers/ota/ota.controller.js';
import {
  HmacCanonical,
  HMAC_CANONICAL_KEY,
  type CanonicalBuilder,
} from './hmac-canonical.decorator.js';

describe('HmacCanonical decorator', () => {
  it('stores the builder as metadata on the method descriptor under HMAC_CANONICAL_KEY', () => {
    const builder: CanonicalBuilder = (b) => String(b['status'] ?? '');
    const descriptor: PropertyDescriptor = {
      value: function testMethod() {
        return undefined;
      },
    };

    const result = HmacCanonical(builder)({}, 'testMethod', descriptor);

    expect(result).toBe(descriptor);
    expect(Reflect.getMetadata(HMAC_CANONICAL_KEY, descriptor.value)).toBe(
      builder,
    );
  });

  it('is retrievable via Reflector.get, the same mechanism HmacAuthGuard uses', () => {
    const builder: CanonicalBuilder = (b) => String(b['status'] ?? '');
    const descriptor: PropertyDescriptor = {
      value: function testMethod() {
        return undefined;
      },
    };
    HmacCanonical(builder)({}, 'testMethod', descriptor);

    const reflector = new Reflector();
    const retrieved = reflector.get<CanonicalBuilder | undefined>(
      HMAC_CANONICAL_KEY,
      descriptor.value,
    );

    expect(retrieved).toBe(builder);
  });

  it('does not attach metadata to unrelated methods', () => {
    const builder: CanonicalBuilder = (b) => String(b['status'] ?? '');
    const decoratedDescriptor: PropertyDescriptor = {
      value: function decorated() {
        return undefined;
      },
    };
    const plainDescriptor: PropertyDescriptor = {
      value: function plain() {
        return undefined;
      },
    };
    HmacCanonical(builder)({}, 'decorated', decoratedDescriptor);

    expect(
      Reflect.getMetadata(HMAC_CANONICAL_KEY, plainDescriptor.value),
    ).toBeUndefined();
  });
});

/**
 * The decorator itself is a thin SetMetadata wrapper — the security-critical
 * logic is the canonical-string builder each route registers with it. These
 * tests read the *actual* builders off the real controllers (via Reflector,
 * the same lookup HmacAuthGuard performs) rather than re-implementing the
 * logic inline, so a future edit to a controller's builder is exercised here
 * automatically instead of silently diverging from a copy.
 */
describe('canonical builder — DeviceStatusController POST /device/status', () => {
  const reflector = new Reflector();
  const builder = reflector.get<CanonicalBuilder | undefined>(
    HMAC_CANONICAL_KEY,
    DeviceStatusController.prototype.reportStatus,
  );

  it('is registered on the route handler', () => {
    expect(builder).toBeDefined();
  });

  it('builds the canonical string from numeric status 1 (ON)', () => {
    expect(builder?.({ status: 1 })).toBe('1');
  });

  it('builds the canonical string from numeric status 0 (OFF)', () => {
    expect(builder?.({ status: 0 })).toBe('0');
  });

  it('defaults to empty string when status is missing', () => {
    expect(builder?.({})).toBe('');
  });

  it('defaults to empty string when status is null', () => {
    expect(builder?.({ status: null })).toBe('');
  });

  it('defaults to empty string when status is undefined', () => {
    expect(builder?.({ status: undefined })).toBe('');
  });

  it('coerces a string status through String() rather than rejecting it', () => {
    // The DTO/LIVR layer validates status is numeric before this ever runs,
    // but the canonical builder itself performs no type check — document
    // that a smuggled string status still produces a deterministic string.
    expect(builder?.({ status: '1' })).toBe('1');
  });

  it('does not accidentally include unrelated body fields (MarkdownV2-sensitive or not)', () => {
    // Any extra field (e.g. a firmwareVersion string with markdown-special
    // characters like `_`/`*`/`[`) must have zero effect on the canonical
    // string — only `status` feeds the signature for this route.
    expect(
      builder?.({
        status: 1,
        firmwareVersion: '1.0.0_beta*[test]',
        voltage: 4095,
      }),
    ).toBe('1');
  });
});

describe('canonical builder — OtaController POST /ota/check', () => {
  const reflector = new Reflector();
  const builder = reflector.get<CanonicalBuilder | undefined>(
    HMAC_CANONICAL_KEY,
    OtaController.prototype.checkForUpdate,
  );

  it('is registered on the route handler', () => {
    expect(builder).toBeDefined();
  });

  it('builds "boardType:currentVersion:channel" for valid fields', () => {
    expect(
      builder?.({
        boardType: 'esp32c3',
        currentVersion: '1.0.0',
        channel: 'STABLE',
      }),
    ).toBe('esp32c3:1.0.0:STABLE');
  });

  it('accepts a prerelease semver in currentVersion unchanged', () => {
    expect(
      builder?.({
        boardType: 'esp32c6',
        currentVersion: '2.0.0-beta.1',
        channel: 'BETA',
      }),
    ).toBe('esp32c6:2.0.0-beta.1:BETA');
  });

  it('throws when boardType is missing', () => {
    expect(() =>
      builder?.({ currentVersion: '1.0.0', channel: 'STABLE' }),
    ).toThrow('Missing required HMAC canonical fields');
  });

  it('throws when currentVersion is missing', () => {
    expect(() =>
      builder?.({ boardType: 'esp32c3', channel: 'STABLE' }),
    ).toThrow('Missing required HMAC canonical fields');
  });

  it('throws when channel is missing', () => {
    expect(() =>
      builder?.({ boardType: 'esp32c3', currentVersion: '1.0.0' }),
    ).toThrow('Missing required HMAC canonical fields');
  });

  it('throws when all fields are missing (empty body)', () => {
    expect(() => builder?.({})).toThrow(
      'Missing required HMAC canonical fields',
    );
  });

  it('treats an empty-string field as missing (falsy check, not just undefined)', () => {
    expect(() =>
      builder?.({ boardType: '', currentVersion: '1.0.0', channel: 'STABLE' }),
    ).toThrow('Missing required HMAC canonical fields');
  });
});
