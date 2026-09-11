import type {
  DeviceRole,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';

/**
 * Identity of the entity invoking a device mutation service.
 * `{ system: true }` is an explicit, deliberate marker for trusted
 * server-side callers (e.g. the CLI) that skip the role check by design —
 * unlike an omitted/optional field, it cannot happen accidentally.
 */
export type Caller = { id: string } | { system: true };

/** Enforces the OWNER/EDITOR/VIEWER role model for device mutation services. */
export async function assertCallerHasRole(
  userDeviceRepository: IUserDeviceRepository,
  caller: Caller,
  deviceId: string,
  requiredRole: DeviceRole,
): Promise<void> {
  if ('system' in caller) {
    return;
  }

  const membership = await userDeviceRepository.findByUserAndDevice(
    caller.id,
    deviceId,
  );

  if (!membership || !membership.hasAtLeastRole(requiredRole)) {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN_ROLE,
      'Caller does not have the required role for this action',
    );
  }
}
