import type {
  FirmwareRelease,
  IFirmwareReleaseRepository,
} from '@home-pulse-watcher/core';
import { ListFirmwareReleasesService } from './list-firmware-releases.service.js';

function makeMockRepo(): jest.Mocked<IFirmwareReleaseRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByVersionAndBoard: jest.fn(),
    findLatestForBoard: jest.fn(),
    findAll: jest.fn(),
    markCritical: jest.fn(),
  };
}

describe('ListFirmwareReleasesService', () => {
  it('returns all releases from the repository', async () => {
    const repo = makeMockRepo();
    const releases = [
      { id: '1', version: '0.1.0' } as FirmwareRelease,
      { id: '2', version: '0.2.0' } as FirmwareRelease,
    ];
    repo.findAll.mockResolvedValue(releases);

    const service = new ListFirmwareReleasesService(repo);
    const { data } = await service.run();

    expect(repo.findAll).toHaveBeenCalled();
    expect(data.releases).toEqual(releases);
  });
});
