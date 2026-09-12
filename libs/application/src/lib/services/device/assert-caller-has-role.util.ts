import type {
  DeviceRole,
  IUserDeviceRepository,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
} from '@home-pulse-watcher/shared';

/**
 * Identity of the entity invoking a device mutation service.
 * `{ system: true }` is an explicit, deliberate marker for trusted
 * server-side callers (e.g. the CLI) that skip the role check by design —
 * unlike an omitted/optional field, it cannot happen accidentally.
 */
export type Caller = { id: string } | { system: true };

/**
 * Enforces the OWNER/EDITOR/VIEWER role model for device mutation services.
 *
 * Enumeration resistance: a caller with ZERO membership rows on the target
 * device gets the exact same `NotFoundError('Device', notFoundIdentifier)`
 * shape a caller referencing a nonexistent device gets — `notFoundIdentifier`
 * must be the same identifier string the calling service already used for
 * its own "device not found" check, so the message text matches byte-for-byte
 * regardless of which branch produced it. Only once the caller has at least
 * one membership row (but an insufficient role) does this throw the distinct
 * `FORBIDDEN_ROLE` DomainError — that case cannot leak info about *other*
 * devices, only about a device the caller already knows they're linked to.
 */
export async function assertCallerHasRole(
  userDeviceRepository: IUserDeviceRepository,
  caller: Caller,
  deviceId: string,
  requiredRole: DeviceRole,
  notFoundIdentifier: string,
): Promise<void> {
  if ('system' in caller) {
    return;
  }

  const membership = await userDeviceRepository.findByUserAndDevice(
    caller.id,
    deviceId,
  );

  if (!membership) {
    throw new NotFoundError('Device', notFoundIdentifier);
  }

  if (!membership.hasAtLeastRole(requiredRole)) {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN_ROLE,
      'Caller does not have the required role for this action',
    );
  }
}
