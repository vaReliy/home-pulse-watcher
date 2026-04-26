// Persistence (Prisma repositories)
export {
  getPrismaClient,
  disconnectPrisma,
  resetPrismaClient,
} from './lib/persistence/prisma-client.factory.js';
export { PrismaUserRepository } from './lib/persistence/user.repository.js';
export { PrismaDeviceRepository } from './lib/persistence/device.repository.js';
export { PrismaUserDeviceRepository } from './lib/persistence/user-device.repository.js';
export { PrismaPowerEventRepository } from './lib/persistence/power-event.repository.js';
export { PrismaFirmwareReleaseRepository } from './lib/persistence/firmware-release.repository.js';

// Mappers
export { mapPrismaUserToEntity } from './lib/mappers/user.mapper.js';
export { mapPrismaDeviceToEntity } from './lib/mappers/device.mapper.js';
export { mapPrismaUserDeviceToEntity } from './lib/mappers/user-device.mapper.js';
export { mapPrismaPowerEventToEntity } from './lib/mappers/power-event.mapper.js';
export { mapPrismaFirmwareReleaseToEntity } from './lib/mappers/firmware-release.mapper.js';
