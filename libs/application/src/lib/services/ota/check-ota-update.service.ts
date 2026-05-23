import type {
  BoardType,
  IDeviceRepository,
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
} from '@home-pulse-watcher/core';
import {
  BoardType as BoardTypeConst,
  channelsVisibleTo,
  isReleaseChannel,
  SIGNED_URL_TTL_MS,
} from '@home-pulse-watcher/core';
import type { LivrRules, ServiceContext } from '@home-pulse-watcher/shared';
import {
  decryptDeviceSecret,
  DomainError,
  DomainErrorCode,
} from '@home-pulse-watcher/shared';
import * as crypto from 'node:crypto';
import semver from 'semver';
import { BaseService } from '../../base-service.js';
import { firmwareGcsPathPrefix } from './firmware-gcs-path.js';

export interface CheckOtaUpdateInput {
  boardType: string;
  currentVersion: string;
}

export type CheckOtaUpdateOutput =
  | { hasUpdate: false }
  | {
      hasUpdate: true;
      version: string;
      url: string;
      checksum: string;
      isCritical: boolean;
      expiresAt: string;
      ts: number;
      sig: string;
    };

/**
 * Checks whether a newer firmware release is available for the requesting device.
 *
 * Channel selection uses the device's DB-stored releaseChannel, not the request body,
 * preventing privilege escalation via client-supplied channel values.
 *
 * Channel waterfall rules:
 * - STABLE devices only see STABLE releases
 * - BETA devices see BETA + STABLE releases
 * - ALPHA devices see ALPHA + BETA + STABLE releases
 */
export class CheckOtaUpdateService extends BaseService<
  CheckOtaUpdateInput,
  CheckOtaUpdateOutput
> {
  constructor(
    private readonly deviceRepo: IDeviceRepository,
    private readonly firmwareRepo: IFirmwareReleaseRepository,
    private readonly storage: IFirmwareStorageService,
    private readonly encryptionKey: string,
  ) {
    super();
  }

  protected validationRules(): LivrRules {
    return {
      boardType: [
        'required',
        'string',
        { one_of: Object.values(BoardTypeConst) },
      ],
      currentVersion: ['required', 'string', 'semverVersion'],
    };
  }

  protected async execute(
    params: CheckOtaUpdateInput,
    context: ServiceContext,
  ): Promise<CheckOtaUpdateOutput> {
    if (!context.deviceId) {
      throw new DomainError(
        DomainErrorCode.DEVICE_NOT_LINKED,
        'Device ID missing from request context',
      );
    }

    const device = await this.deviceRepo.findById(context.deviceId);
    if (!device) {
      throw new DomainError(
        DomainErrorCode.DEVICE_NOT_LINKED,
        `Device not found: ${context.deviceId}`,
      );
    }

    const raw = device.releaseChannel;
    if (!isReleaseChannel(raw)) {
      throw new DomainError(
        DomainErrorCode.INVALID_DEVICE_STATE,
        `Device ${device.macAddress} has invalid releaseChannel: "${raw}"`,
      );
    }
    const channels = channelsVisibleTo(raw);
    const releases = await this.firmwareRepo.findLatestForBoard(
      params.boardType as BoardType,
      channels,
    );

    if (releases.length === 0) {
      return { hasUpdate: false };
    }

    // Pick the highest semver release to avoid insertion-order bias.
    // includePrerelease ensures alpha/beta tags are not excluded from selection.
    const versions = releases.map((r) => r.version);
    const maxVersion = semver.maxSatisfying(versions, '*', {
      includePrerelease: true,
    });
    if (!maxVersion) {
      return { hasUpdate: false };
    }

    const latest = releases.find((r) => r.version === maxVersion);
    if (!latest) {
      return { hasUpdate: false };
    }

    if (!semver.gt(latest.version, params.currentVersion)) {
      return { hasUpdate: false };
    }

    const expectedPrefix = firmwareGcsPathPrefix(params.boardType);
    if (!latest.gcsPath.startsWith(expectedPrefix)) {
      throw new DomainError(
        DomainErrorCode.BOARD_MISMATCH,
        `Board mismatch: release path does not match requesting board`,
      );
    }

    const ts = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString();

    const url = await this.storage.getSignedUrl(latest.gcsPath);

    const deviceSecret = decryptDeviceSecret(
      device.encryptedSecret,
      this.encryptionKey,
    );

    const canonical = `${latest.version}|${url}|${latest.checksum}|${latest.isCritical}|${expiresAt}|${ts}`;
    const sig = crypto
      .createHmac('sha256', deviceSecret)
      .update(canonical)
      .digest('hex');

    return {
      hasUpdate: true,
      version: latest.version,
      url,
      checksum: latest.checksum,
      isCritical: latest.isCritical,
      expiresAt,
      ts,
      sig,
    };
  }
}
