import semver from 'semver';
import type {
  IFirmwareReleaseRepository,
  IFirmwareStorageService,
  BoardType,
  ReleaseChannel,
} from '@home-pulse-watcher/core';
import {
  BoardType as BoardTypeConst,
  ReleaseChannel as ReleaseChannelConst,
  channelsVisibleTo,
} from '@home-pulse-watcher/core';
import type { LivrRules, ServiceContext } from '@home-pulse-watcher/shared';
import { DomainError, DomainErrorCode } from '@home-pulse-watcher/shared';
import { BaseService } from '../../base-service.js';
import { firmwareGcsPathPrefix } from './firmware-gcs-path.js';

export interface CheckOtaUpdateInput {
  boardType: string;
  currentVersion: string;
  channel: string;
}

export type CheckOtaUpdateOutput =
  | { hasUpdate: false }
  | {
      hasUpdate: true;
      version: string;
      url: string;
      checksum: string;
      isCritical: boolean;
    };

/**
 * Checks whether a newer firmware release is available for the requesting device.
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
    private readonly firmwareRepo: IFirmwareReleaseRepository,
    private readonly storage: IFirmwareStorageService,
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
      channel: [
        'required',
        'string',
        { one_of: Object.values(ReleaseChannelConst) },
      ],
    };
  }

  protected async execute(
    params: CheckOtaUpdateInput,
    _context: ServiceContext,
  ): Promise<CheckOtaUpdateOutput> {
    const channels = channelsVisibleTo(params.channel as ReleaseChannel);
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

    const url = await this.storage.getSignedUrl(latest.gcsPath);

    return {
      hasUpdate: true,
      version: latest.version,
      url,
      checksum: latest.checksum,
      isCritical: latest.isCritical,
    };
  }
}
