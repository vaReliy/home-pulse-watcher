import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  GetUserDevicesOverviewService,
  UpdateDeviceService,
  DeleteDeviceService,
  RotateDeviceSecretService,
  RequestOtaForceCheckService,
  UserDeviceOverview,
} from '@home-pulse-watcher/application';
import type { User } from '@home-pulse-watcher/core';
import { DeviceRole } from '@home-pulse-watcher/core';
import {
  DomainError,
  DomainErrorCode,
  NotFoundError,
  ValidationError,
} from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../services/service.tokens.js';
import { TranslationService } from '../i18n/index.js';
import { codeMd, escapeMarkdownV2 } from '../formatters/escape-markdown.js';
import {
  buildDeviceActionKeyboard,
  buildDeleteConfirmKeyboard,
} from '../keyboards/index.js';
import type { TelegramContext } from '../types/telegram-context.type.js';
import type { Messages } from '../i18n/messages.type.js';

/** How long a "send the new name" prompt stays valid before the pending rename expires. */
const RENAME_PROMPT_TTL_MS = 5 * 60 * 1000;

/**
 * How often the background sweep clears expired `pendingRenames` entries.
 * Same cadence as the TTL — an abandoned entry lives at most ~2x the TTL.
 */
const RENAME_SWEEP_INTERVAL_MS = RENAME_PROMPT_TTL_MS;

interface PendingRename {
  deviceId: string;
  expiresAt: number;
}

/**
 * Handles role-gated device-management actions triggered from Telegram inline
 * buttons: device menu, rename, delete (with confirm step), rotate secret,
 * request OTA check. Every mutation calls its Application service with
 * `caller: { id: user.id }` — never `{ system: true }`, which is CLI-only.
 *
 * Role enforcement is always re-checked server-side by the Application
 * services (`assertCallerHasRole`); the lookups here only drive which
 * buttons are shown, closing the "stale keyboard" race with a localized
 * `FORBIDDEN_ROLE` denial rather than a raw exception.
 */
@Injectable()
export class DeviceActionsHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceActionsHandler.name);

  /**
   * In-memory "awaiting new device name" state, keyed by Telegram user id.
   * Acceptable for this single-instance MVP deployment (see project memory:
   * Cloud Run min/max instances = 1) — a horizontally scaled deployment
   * would need to move this to Redis. Entries are removed lazily when
   * consumed (`tryHandleRenameText`) or overwritten by a new rename for the
   * same user, but a user who taps Rename and then abandons the chat leaves
   * an entry behind forever — `renameSweepTimer` periodically clears any
   * entry past its TTL so distinct abandoning users can't grow this map
   * without bound.
   */
  private readonly pendingRenames = new Map<number, PendingRename>();

  /** Periodic sweep handle for abandoned `pendingRenames` entries; see above. */
  private renameSweepTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(SERVICE_TOKENS.GET_USER_DEVICES_OVERVIEW)
    private readonly getUserDevicesOverviewService: GetUserDevicesOverviewService,
    @Inject(SERVICE_TOKENS.UPDATE_DEVICE)
    private readonly updateDeviceService: UpdateDeviceService,
    @Inject(SERVICE_TOKENS.DELETE_DEVICE)
    private readonly deleteDeviceService: DeleteDeviceService,
    @Inject(SERVICE_TOKENS.ROTATE_DEVICE_SECRET)
    private readonly rotateDeviceSecretService: RotateDeviceSecretService,
    @Inject(SERVICE_TOKENS.REQUEST_OTA_FORCE_CHECK)
    private readonly requestOtaForceCheckService: RequestOtaForceCheckService,
    private readonly translationService: TranslationService,
  ) {}

  onModuleInit(): void {
    this.renameSweepTimer = setInterval(() => {
      this.sweepExpiredRenames();
    }, RENAME_SWEEP_INTERVAL_MS);
    // Don't hold the process open just for this housekeeping timer.
    this.renameSweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.renameSweepTimer) {
      clearInterval(this.renameSweepTimer);
      this.renameSweepTimer = undefined;
    }
  }

  /** Returns true when the given Telegram user currently has a rename prompt pending. */
  hasPendingRename(telegramId: number): boolean {
    return this.pendingRenames.has(telegramId);
  }

  /** Removes any `pendingRenames` entry past its TTL. See field comment above. */
  private sweepExpiredRenames(): void {
    const now = Date.now();
    for (const [telegramId, pending] of this.pendingRenames) {
      if (pending.expiresAt < now) {
        this.pendingRenames.delete(telegramId);
      }
    }
  }

  /** Opens the per-device action menu, filtered by the caller's current role. */
  async handleMenu(ctx: TelegramContext, deviceId: string): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    const entry = await this.resolveDeviceEntry(user.id, deviceId);
    if (!entry) {
      await ctx.reply(msgs.ERROR_DEVICE_NOT_FOUND, {
        parse_mode: 'MarkdownV2',
      });
      return;
    }
    if (entry.role === DeviceRole.VIEWER) {
      await ctx.reply(msgs.ERROR_FORBIDDEN_ROLE, { parse_mode: 'MarkdownV2' });
      return;
    }

    const label = this.resolveLabel(entry);
    await ctx.reply(msgs.DEVICE_MENU_HEADER(escapeMarkdownV2(label)), {
      parse_mode: 'MarkdownV2',
      ...buildDeviceActionKeyboard(msgs, deviceId, entry.role),
    });
  }

  /** Prompts the caller to send the device's new name as free text. */
  async handleRenamePrompt(
    ctx: TelegramContext,
    deviceId: string,
  ): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    const entry = await this.resolveDeviceEntry(user.id, deviceId);
    if (!entry || !this.canRename(entry.role)) {
      await ctx.reply(
        entry ? msgs.ERROR_FORBIDDEN_ROLE : msgs.ERROR_DEVICE_NOT_FOUND,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    this.pendingRenames.set(telegramId, {
      deviceId,
      expiresAt: Date.now() + RENAME_PROMPT_TTL_MS,
    });

    const label = this.resolveLabel(entry);
    await ctx.reply(msgs.DEVICE_RENAME_PROMPT(escapeMarkdownV2(label)), {
      parse_mode: 'MarkdownV2',
    });
  }

  /**
   * Consumes a pending rename if one is active for this Telegram user.
   * Returns `false` (untouched) when there's no pending rename, so the
   * caller's normal catch-all text handling can proceed unaffected.
   */
  async tryHandleRenameText(
    ctx: TelegramContext,
    user: User,
    text: string,
  ): Promise<boolean> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return false;

    const pending = this.pendingRenames.get(telegramId);
    if (!pending) return false;
    this.pendingRenames.delete(telegramId);

    const msgs = this.translationService.getMessages(user.locale);
    if (pending.expiresAt < Date.now()) {
      await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      return true;
    }

    try {
      const { data } = await this.updateDeviceService.run({
        id: pending.deviceId,
        label: text,
        caller: { id: user.id },
      });
      const newLabel = data.device.label ?? data.device.macAddress;
      await ctx.reply(msgs.DEVICE_RENAMED(escapeMarkdownV2(newLabel)), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      await this.replyForError(ctx, msgs, error, 'rename');
    }
    return true;
  }

  /** Shows the "are you sure?" confirm/cancel step before deleting. */
  async handleDeleteConfirm(
    ctx: TelegramContext,
    deviceId: string,
  ): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    const entry = await this.resolveDeviceEntry(user.id, deviceId);
    if (!entry || entry.role !== DeviceRole.OWNER) {
      await ctx.reply(
        entry ? msgs.ERROR_FORBIDDEN_ROLE : msgs.ERROR_DEVICE_NOT_FOUND,
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const label = this.resolveLabel(entry);
    await ctx.reply(msgs.DEVICE_DELETE_CONFIRM(escapeMarkdownV2(label)), {
      parse_mode: 'MarkdownV2',
      ...buildDeleteConfirmKeyboard(msgs, deviceId),
    });
  }

  /** Cancels the pending delete — no service call is made. */
  async handleDeleteCancel(ctx: TelegramContext): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);
    await ctx.reply(msgs.DEVICE_DELETE_CANCELLED, { parse_mode: 'MarkdownV2' });
  }

  /** Executes the delete after explicit confirmation. */
  async handleDeleteExecute(
    ctx: TelegramContext,
    deviceId: string,
  ): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    try {
      const { data } = await this.deleteDeviceService.run({
        id: deviceId,
        caller: { id: user.id },
      });
      const label = data.device.label ?? data.device.macAddress;
      await ctx.reply(msgs.DEVICE_DELETED(escapeMarkdownV2(label)), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      await this.replyForError(ctx, msgs, error, 'delete');
    }
  }

  /** Generates a new HMAC secret for the device (OWNER only). */
  async handleRotateSecret(
    ctx: TelegramContext,
    deviceId: string,
  ): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    const deviceSecretEncryptionKey =
      process.env['DEVICE_SECRET_ENCRYPTION_KEY'];
    if (!deviceSecretEncryptionKey) {
      this.logger.error(
        'DEVICE_SECRET_ENCRYPTION_KEY not set — cannot rotate device secret',
      );
      await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
      return;
    }

    try {
      const { data } = await this.rotateDeviceSecretService.run(
        { id: deviceId, caller: { id: user.id } },
        { config: { deviceSecretEncryptionKey } },
      );
      await ctx.reply(msgs.DEVICE_SECRET_ROTATED(codeMd(data.secret)), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      await this.replyForError(ctx, msgs, error, 'rotate-secret');
    }
  }

  /** Sets the sticky "force OTA check" flag on the device (OWNER only). */
  async handleOtaCheck(ctx: TelegramContext, deviceId: string): Promise<void> {
    const user = ctx.user;
    if (!user) return;
    const msgs = this.translationService.getMessages(user.locale);

    try {
      const { data } = await this.requestOtaForceCheckService.run({
        id: deviceId,
        caller: { id: user.id },
      });
      const label = data.device.label ?? data.device.macAddress;
      await ctx.reply(
        msgs.DEVICE_OTA_CHECK_REQUESTED(escapeMarkdownV2(label)),
        {
          parse_mode: 'MarkdownV2',
        },
      );
    } catch (error) {
      await this.replyForError(ctx, msgs, error, 'ota-check');
    }
  }

  private canRename(role: DeviceRole): boolean {
    return role === DeviceRole.EDITOR || role === DeviceRole.OWNER;
  }

  private resolveLabel(entry: UserDeviceOverview): string {
    return entry.customName ?? entry.device.label ?? entry.device.macAddress;
  }

  private async resolveDeviceEntry(
    userId: string,
    deviceId: string,
  ): Promise<UserDeviceOverview | null> {
    const { data } = await this.getUserDevicesOverviewService.run({ userId });
    return data.devices.find((entry) => entry.device.id === deviceId) ?? null;
  }

  private async replyForError(
    ctx: TelegramContext,
    msgs: Messages,
    error: unknown,
    action: string,
  ): Promise<void> {
    if (
      error instanceof DomainError &&
      error.code === DomainErrorCode.FORBIDDEN_ROLE
    ) {
      await ctx.reply(msgs.ERROR_FORBIDDEN_ROLE, { parse_mode: 'MarkdownV2' });
      return;
    }
    if (error instanceof NotFoundError) {
      await ctx.reply(msgs.ERROR_DEVICE_NOT_FOUND, {
        parse_mode: 'MarkdownV2',
      });
      return;
    }
    if (error instanceof ValidationError) {
      await ctx.reply(msgs.ERROR_INVALID_LABEL, { parse_mode: 'MarkdownV2' });
      return;
    }

    this.logger.error(
      `Failed to ${action} device`,
      error instanceof Error ? error.stack : String(error),
    );
    await ctx.reply(msgs.ERROR_GENERIC, { parse_mode: 'MarkdownV2' });
  }
}
