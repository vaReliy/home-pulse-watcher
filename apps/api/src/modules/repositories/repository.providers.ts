import type { Provider } from '@nestjs/common';
import {
  PrismaUserRepository,
  PrismaDeviceRepository,
  PrismaUserDeviceRepository,
  PrismaPowerEventRepository,
} from '@home-pulse-watcher/infrastructure';
import { PrismaService } from '../prisma/prisma.service';
import { REPOSITORY_TOKENS } from './repository.tokens';

export const repositoryProviders: Provider[] = [
  {
    provide: REPOSITORY_TOKENS.USER,
    useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: REPOSITORY_TOKENS.DEVICE,
    useFactory: (prisma: PrismaService) => new PrismaDeviceRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: REPOSITORY_TOKENS.USER_DEVICE,
    useFactory: (prisma: PrismaService) =>
      new PrismaUserDeviceRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: REPOSITORY_TOKENS.POWER_EVENT,
    useFactory: (prisma: PrismaService) =>
      new PrismaPowerEventRepository(prisma),
    inject: [PrismaService],
  },
];
