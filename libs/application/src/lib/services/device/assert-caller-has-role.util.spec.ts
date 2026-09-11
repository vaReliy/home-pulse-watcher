import type { IUserDeviceRepository } from '@home-pulse-watcher/core';
import { DeviceRole, UserDevice } from '@home-pulse-watcher/core';
import { DomainErrorCode } from '@home-pulse-watcher/shared';
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
      ),
    ).resolves.toBeUndefined();
  });

  it('throws FORBIDDEN_ROLE DomainError when caller role is below required', async () => {
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
      ),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
  });

  it('throws FORBIDDEN_ROLE DomainError when no membership exists', async () => {
    const userDeviceRepo = createMockUserDeviceRepository();
    userDeviceRepo.findByUserAndDevice.mockResolvedValue(null);

    await expect(
      assertCallerHasRole(
        userDeviceRepo,
        { id: 'caller-1' },
        'device-1',
        DeviceRole.VIEWER,
      ),
    ).rejects.toMatchObject({ code: DomainErrorCode.FORBIDDEN_ROLE });
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
      );

      // @ts-expect-error caller must be { id: string } | { system: true }
      void assertCallerHasRole(
        userDeviceRepo,
        {},
        'device-1',
        DeviceRole.VIEWER,
      );
    }
    void neverRuns;
  });
});
