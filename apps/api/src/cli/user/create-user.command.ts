import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { CreateUserService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface CreateUserOptions {
  telegramId: string;
  username?: string;
}

@Command({
  name: 'user:create',
  description: 'Create a new user from Telegram ID',
})
export class CreateUserCommand extends CommandRunner {
  private readonly logger = new Logger(CreateUserCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.CREATE_USER)
    private readonly createUserService: CreateUserService,
  ) {
    super();
  }

  async run(_inputs: string[], options: CreateUserOptions): Promise<void> {
    try {
      const result = await this.createUserService.run({
        telegramId: options.telegramId,
        username: options.username,
      });

      const user = result.data;

      console.log('\n=== User Created Successfully ===');
      console.log(`ID:          ${user.id}`);
      console.log(`Telegram ID: ${user.telegramId.toString()}`);
      console.log(`Username:    ${user.username ?? '(none)'}`);
      console.log(`Created At:  ${user.createdAt.toISOString()}\n`);
    } catch (error) {
      if (error instanceof BaseError) {
        this.logger.error(`${error.code}: ${error.message}`);
      } else if (error instanceof Error) {
        this.logger.error(error.message);
      }
      process.exit(1);
    }
  }

  @Option({
    flags: '-t, --telegram-id <telegramId>',
    description: 'Telegram user ID',
    required: true,
  })
  parseTelegramId(val: string): string {
    return val;
  }

  @Option({
    flags: '-u, --username <username>',
    description: 'Telegram username (optional)',
  })
  parseUsername(val: string): string {
    return val;
  }
}
