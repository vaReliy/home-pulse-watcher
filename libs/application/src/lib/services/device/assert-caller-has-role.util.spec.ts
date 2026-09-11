import type { IUserDeviceRepository } from '@home-pulse-watcher/core';
import { DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import { DomainErrorCode, NotFoundError } from '@home-pulse-watcher/shared';
import { assertCallerHasRole } from './assert-caller-has-role.util.js';

describe('assertCallerHasRole', () => {
  const createMockUserDeviceRepository =
    (): jest.Mocked<IUserDeviceRepository> => ({
      findByUserAndDevice: jest.fn(),
      findByUserId: jest.fn(),
      findByDeviceId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      countByDeviceId: jest.fn(),
    });

  it('resolves without querying membership when caller is { system: true }', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { system: true },
        'device-1',
        DeviceRole.OWNER,
        'device-1',
      ),
    ).resolves.toBeUndefined();
    expect(userDeviceRepo.findByUserAndDevice).not.toHaveBeenCalled();
  });

  it('resolves when caller has at least the required role', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    userDeviceRepo.findByUserAndDevice.mockResolvedValue(
      new UserDevice({
        userId: 'caller-1',
        deviceId: 'device-1',
        customName: null,
        role: DeviceRole.OWNER,
      }),
    );

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { id: 'caller-1' },
        'device-1',
        DeviceRole.EDITOR,
        'device-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('throws FORBIDDEN_ROLE DomainError when caller has membership but role is below required', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    userDeviceRepo.findByUserAndDevice.mockResolvedValue(
      new UserDevice({
        userId: 'caller-1',
        deviceId: 'device-1',
        customName: null,
        role: DeviceRole.VIEWER,
      }),
    );

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { id: 'caller-1' },
        'device-1',
        DeviceRole.EDITOR,
        'device-1',
      ),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
  });

  it('throws NotFoundError (not FORBIDDEN_ROLE) when caller has zero membership rows on the device', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { id: 'caller-1' },
        'device-1',
        DeviceRole.VIEWER,
        'device-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('produces a byte-identical NotFoundError to the "device does not exist" case, given the same identifier — this is the enumeration-resistance guarantee', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

    const nonexistentDeviceError = new NotFoundError('Device', 'device-99');

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { id: 'caller-1' },
        'device-99',
        DeviceRole.VIEWER,
        'device-99',
      ),
    ).rejects.toMatchObject({
      code: nonexistentDeviceError.code,
      httpStatus: nonexistentDeviceError.httpStatus,
      message: nonexistentDeviceError.message,
      resourceType: nonexistentDeviceError.resourceType,
      identifier: nonexistentDeviceError.identifier,
    });
  });

  // Type-only checks: this function body is never invoked at runtime (SWC
  // strips types without checking them, so `@ts-expect-error` only has
  // teeth under `tsc` — that's exactly the typecheck target this guards).
  // Assigning to `never` also fails the build outright if a future refactor
  // makes `caller` optional/widened and these lines silently stop erroring.
  it('rejects a caller missing both branches at compile time (tsc-checked, not executed)', () => {
    function neverRuns(): void {
      const userDeviceRepo = createMockUserDeviceRepository();

      // @ts-expect-error caller is required — omitting it must not compile,
      // since that was the fail-open bypass this type closes.
      void assertCallerHasRole(
        userDeviceRepo,
        undefined,
        'device-1',
        DeviceRole.VIEWER,
        'device-1',
      );

      // @ts-expect-error caller must be { id: string } | { system: true }
      void assertCallerHasRole(
        userDeviceRepo,
        {},
        'device-1',
        DeviceRole.VIEWER,
        'device-1',
      );
    }
    void neverRuns;
  });
});
