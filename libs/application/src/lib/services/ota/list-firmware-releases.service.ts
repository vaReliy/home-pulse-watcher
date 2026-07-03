import type {
  FirmwareRelease,
  IFirmwareReleaseRepository,
} from '@home-pulse-watcher/core';
import type { ServiceResponse } from '@home-pulse-watcher/shared';

export interface ListFirmwareReleasesOutput {
  releases: FirmwareRelease[];
}

/** Read-only query for the `firmware:list` CLI command — all releases, newest first per board/channel. */
export class ListFirmwareReleasesService {
  constructor(private readonly firmwareRepo: IFirmwareReleaseRepository) {}

  async run(): Promise<ServiceResponse<ListFirmwareReleasesOutput>> {
    const releases = await this.firmwareRepo.findAll();
    return { data: { releases } };
  }
}
