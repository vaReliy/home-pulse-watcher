import type {
  GetUserDevicesOverviewService,
  GetUserDevicesOverviewOutput,
  UpdateDeviceService,
  DeleteDeviceService,
  RotateDeviceSecretService,
  RequestOtaForceCheckService,
} from '@home-pulse-watcher/application';
import type { User, Device } from '@home-pulse-watcher/core';
import {
  DeviceRole,
  ReleaseChannel,
  DeviceType,
} from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { DeviceActionsHandler } from './device-actions.handler.js';
import { TranslationService } from '../i18n/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';

describe('DeviceActionsHandler', () => {
  const translationService = new TranslationService();
  const msgs = translationService.getMessages('uk');

  const mockUser: User = {
    id: 'user-1',
    telegramId: BigInt(12345),
    username: 'testuser',
    locale: 'uk',
    timezone: 'Europe/Kyiv',
    createdAt: new Date(),
  } as User;

  const buildDevice = (overrides: Partial<Device> = {}): Device =>
    ({
      id: 'device-1',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      encryptedSecret: 'secret',
      label: 'Kitchen',
      lastStatus: null,
      lastSeenAt: null,
      statusChangedAt: null,
      firmwareVersion: '1.0.0',
      batteryVoltage: null,
      releaseChannel: ReleaseChannel.STABLE,
      deviceType: DeviceType.MAINS,
      isOnline: () => true,
      ...overrides,
    }) as Device;

  const buildOverviewOutput = (
    role: DeviceRole,
    device: Device = buildDevice(),
  ): GetUserDevicesOverviewOutput => ({
    devices: [{ device, customName: null, role }],
    total: 1,
  });

  const createDeps = () => ({
    getUserDevicesOverviewService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<GetUserDevicesOverviewService>,
    updateDeviceService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<UpdateDeviceService>,
    deleteDeviceService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<DeleteDeviceService>,
    rotateDeviceSecretService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<RotateDeviceSecretService>,
    requestOtaForceCheckService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<RequestOtaForceCheckService>,
  });

  const createHandler = (
    deps: ReturnType<typeof createDeps>,
  ): DeviceActionsHandler =>
    new DeviceActionsHandler(
      deps.getUserDevicesOverviewService,
      deps.updateDeviceService,
      deps.deleteDeviceService,
      deps.rotateDeviceSecretService,
      deps.requestOtaForceCheckService,
      translationService,
    );

  const createCtx = (): TelegramContext =>
    ({
      user: mockUser,
      from: { id: 12345 },
      reply: jest.fn(),
    }) as unknown as TelegramContext;

  let originalEncryptionKey: string | undefined;

  beforeEach(() => {
    originalEncryptionKey = process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = 'test-encryption-key';
  });

  afterEach(() => {
    process.env['DEVICE_SECRET_ENCRYPTION_KEY'] = originalEncryptionKey;
  });

  describe('handleMenu', () => {
    it('no-ops when ctx.user is missing', async () => {
      const deps = createDeps();
      const handler = createHandler(deps);
      const ctx = { ...createCtx(), user: undefined } as TelegramContext;

      await handler.handleMenu(ctx, 'device-1');

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('replies ERROR_DEVICE_NOT_FOUND when device is not in the caller overview', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: { devices: [], total: 0 },
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleMenu(ctx, 'missing-device');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_DEVICE_NOT_FOUND,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('replies ERROR_FORBIDDEN_ROLE for VIEWER role', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.VIEWER),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleMenu(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_FORBIDDEN_ROLE,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('shows the device menu for EDITOR role', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleMenu(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_MENU_HEADER('Kitchen'),
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });
  });

  describe('handleRenamePrompt', () => {
    it('denies VIEWER role', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.VIEWER),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleRenamePrompt(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_FORBIDDEN_ROLE,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('prompts and records pending rename for EDITOR role', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleRenamePrompt(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_RENAME_PROMPT('Kitchen'),
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );

      // Consumed by a subsequent tryHandleRenameText call.
      deps.updateDeviceService.run.mockResolvedValue({
        data: { device: buildDevice({ label: 'Living Room' }) },
      });
      const handled = await handler.tryHandleRenameText(
        ctx,
        mockUser,
        'Living Room',
      );
      expect(handled).toBe(true);
      expect(deps.updateDeviceService.run).toHaveBeenCalledWith({
        id: 'device-1',
        label: 'Living Room',
        caller: { id: mockUser.id },
      });
    });
  });

  describe('pendingRenames sweep', () => {
    it('sweeps an abandoned pending rename entry after the TTL elapses, even when never consumed', async () => {
      jest.useFakeTimers();
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      handler.onModuleInit();
      await handler.handleRenamePrompt(ctx, 'device-1');

      // Abandoned: user never sends text and never cancels.
      // Matches createCtx()'s from.id.
      const telegramId = 12345;
      expect(handler.hasPendingRename(telegramId)).toBe(true);

      // The sweep interval equals the TTL, so the first tick lands exactly
      // at expiresAt (not yet strictly past it). Advance two full sweep
      // intervals so a second tick runs after the entry has truly expired.
      await jest.advanceTimersByTimeAsync(2 * 5 * 60 * 1000 + 1);

      expect(handler.hasPendingRename(telegramId)).toBe(false);

      handler.onModuleDestroy();
      jest.useRealTimers();
    });

    it('clears the sweep timer on module destroy', () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const deps = createDeps();
      const handler = createHandler(deps);

      handler.onModuleInit();
      handler.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
      jest.useRealTimers();
    });
  });

  describe('tryHandleRenameText', () => {
    it('returns false when no rename is pending', async () => {
      const deps = createDeps();
      const handler = createHandler(deps);
      const ctx = createCtx();

      const handled = await handler.tryHandleRenameText(
        ctx,
        mockUser,
        'anything',
      );

      expect(handled).toBe(false);
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(deps.updateDeviceService.run).not.toHaveBeenCalled();
    });

    it('replies ERROR_GENERIC and skips the service call when the pending rename has expired', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      await handler.handleRenamePrompt(ctx, 'device-1');

      // Past the 5-minute TTL recorded when the prompt was issued.
      nowSpy.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);

      const handled = await handler.tryHandleRenameText(
        ctx,
        mockUser,
        'Living Room',
      );

      expect(handled).toBe(true);
      expect(deps.updateDeviceService.run).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenLastCalledWith(
        msgs.ERROR_GENERIC,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );

      nowSpy.mockRestore();
    });

    it('consumes the pending rename on first use — a second unrelated text does not re-trigger it', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      deps.updateDeviceService.run.mockResolvedValue({
        data: { device: buildDevice({ label: 'Living Room' }) },
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleRenamePrompt(ctx, 'device-1');
      const firstHandled = await handler.tryHandleRenameText(
        ctx,
        mockUser,
        'Living Room',
      );
      expect(firstHandled).toBe(true);
      expect(deps.updateDeviceService.run).toHaveBeenCalledTimes(1);

      const secondHandled = await handler.tryHandleRenameText(
        ctx,
        mockUser,
        'some unrelated free text',
      );

      expect(secondHandled).toBe(false);
      expect(deps.updateDeviceService.run).toHaveBeenCalledTimes(1);
    });

    it('replies ERROR_FORBIDDEN_ROLE when the service rejects with FORBIDDEN_ROLE', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();
      await handler.handleRenamePrompt(ctx, 'device-1');

      deps.updateDeviceService.run.mockRejectedValue(
        new DomainError(
          DomainErrorCode.FORBIDDEN_ROLE,
          'Caller does not have the required role for this action',
        ),
      );

      await handler.tryHandleRenameText(ctx, mockUser, 'New Name');

      expect(ctx.reply).toHaveBeenLastCalledWith(
        msgs.ERROR_FORBIDDEN_ROLE,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('replies ERROR_DEVICE_NOT_FOUND when the service rejects with NotFoundError', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();
      await handler.handleRenamePrompt(ctx, 'device-1');

      deps.updateDeviceService.run.mockRejectedValue(
        new NotFoundError('Device', 'device-1'),
      );

      await handler.tryHandleRenameText(ctx, mockUser, 'New Name');

      expect(ctx.reply).toHaveBeenLastCalledWith(
        msgs.ERROR_DEVICE_NOT_FOUND,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('replies ERROR_INVALID_LABEL when the service rejects with ValidationError', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();
      await handler.handleRenamePrompt(ctx, 'device-1');

      deps.updateDeviceService.run.mockRejectedValue(
        new ValidationError({ label: 'too long' }),
      );

      await handler.tryHandleRenameText(ctx, mockUser, 'x'.repeat(200));

      expect(ctx.reply).toHaveBeenLastCalledWith(
        msgs.ERROR_INVALID_LABEL,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });
  });

  describe('handleDeleteConfirm / handleDeleteCancel / handleDeleteExecute', () => {
    it('denies non-OWNER roles for delete confirm', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.EDITOR),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleDeleteConfirm(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_FORBIDDEN_ROLE,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('shows the confirm keyboard for OWNER role', async () => {
      const deps = createDeps();
      deps.getUserDevicesOverviewService.run.mockResolvedValue({
        data: buildOverviewOutput(DeviceRole.OWNER),
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleDeleteConfirm(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_DELETE_CONFIRM('Kitchen'),
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('cancel replies DEVICE_DELETE_CANCELLED without calling any service', async () => {
      const deps = createDeps();
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleDeleteCancel(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_DELETE_CANCELLED,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
      expect(deps.deleteDeviceService.run).not.toHaveBeenCalled();
    });

    it('execute calls DeleteDeviceService with caller: { id } and replies DEVICE_DELETED', async () => {
      const deps = createDeps();
      deps.deleteDeviceService.run.mockResolvedValue({
        data: {
          device: buildDevice(),
          deletedLinksCount: 1,
          deletedEventsCount: 3,
        },
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleDeleteExecute(ctx, 'device-1');

      expect(deps.deleteDeviceService.run).toHaveBeenCalledWith({
        id: 'device-1',
        caller: { id: mockUser.id },
      });
      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_DELETED('Kitchen'),
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('execute replies ERROR_FORBIDDEN_ROLE on FORBIDDEN_ROLE denial', async () => {
      const deps = createDeps();
      deps.deleteDeviceService.run.mockRejectedValue(
        new DomainError(DomainErrorCode.FORBIDDEN_ROLE, 'denied'),
      );
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleDeleteExecute(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_FORBIDDEN_ROLE,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });
  });

  describe('handleRotateSecret', () => {
    it('replies ERROR_GENERIC and skips the service call when encryption key is missing', async () => {
      delete process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
      const deps = createDeps();
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleRotateSecret(ctx, 'device-1');

      expect(deps.rotateDeviceSecretService.run).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_GENERIC,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('rotates the secret and replies with the new value', async () => {
      const deps = createDeps();
      deps.rotateDeviceSecretService.run.mockResolvedValue({
        data: { device: buildDevice(), secret: 'brand-new-secret' },
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleRotateSecret(ctx, 'device-1');

      expect(deps.rotateDeviceSecretService.run).toHaveBeenCalledWith(
        { id: 'device-1', caller: { id: mockUser.id } },
        { config: { deviceSecretEncryptionKey: 'test-encryption-key' } },
      );
      const replyArg = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
      expect(replyArg).toContain('brand-new-secret');
    });
  });

  describe('handleOtaCheck', () => {
    it('requests the OTA check and replies with confirmation', async () => {
      const deps = createDeps();
      deps.requestOtaForceCheckService.run.mockResolvedValue({
        data: { device: buildDevice() },
      });
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleOtaCheck(ctx, 'device-1');

      expect(deps.requestOtaForceCheckService.run).toHaveBeenCalledWith({
        id: 'device-1',
        caller: { id: mockUser.id },
      });
      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.DEVICE_OTA_CHECK_REQUESTED('Kitchen'),
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });

    it('replies ERROR_GENERIC on unexpected error and logs it', async () => {
      const deps = createDeps();
      deps.requestOtaForceCheckService.run.mockRejectedValue(
        new Error('DB unreachable'),
      );
      const handler = createHandler(deps);
      const ctx = createCtx();

      await handler.handleOtaCheck(ctx, 'device-1');

      expect(ctx.reply).toHaveBeenCalledWith(
        msgs.ERROR_GENERIC,
        expect.objectContaining({ parse_mode: 'MarkdownV2' }),
      );
    });
  });
});
