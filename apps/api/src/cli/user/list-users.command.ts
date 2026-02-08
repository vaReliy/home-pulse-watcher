import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import type { ListUsersService } from '@home-pulse-watcher/application';
import { BaseError } from '@home-pulse-watcher/shared';
import { SERVICE_TOKENS } from '../../modules/services/services.module';

interface ListUsersOptions {
  username?: string;
}

@Command({
  name: 'user:list',
  description: 'List registered users',
})
export class ListUsersCommand extends CommandRunner {
  private readonly logger = new Logger(ListUsersCommand.name);

  constructor(
    @Inject(SERVICE_TOKENS.LIST_USERS)
    private readonly listUsersService: ListUsersService,
  ) {
    super();
  }

  async run(_inputs: string[], options: ListUsersOptions): Promise<void> {
    try {
      const result = await this.listUsersService.run({
        username: options.username,
      });

      const { users, total } = result.data;

      if (options.username) {
        console.log(`\nUsers matching "${options.username}":\n`);
      } else {
        console.log('\nAll registered users:\n');
      }

      if (users.length === 0) {
        console.log('No users found.\n');
        return;
      }

      console.log(
        'ID'.padEnd(40) +
          'Telegram ID'.padEnd(20) +
          'Username'.padEnd(20) +
          'Created At',
      );
      console.log('-'.repeat(100));

      for (const user of users) {
        console.log(
          user.id.padEnd(40) +
            user.telegramId.toString().padEnd(20) +
            (user.username ?? '-').padEnd(20) +
            user.createdAt.toISOString(),
        );
      }

      console.log(`\nTotal: ${total} user(s)\n`);
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
    flags: '-u, --username <username>',
    description: 'Filter by username (partial match)',
  })
  parseUsername(val: string): string {
    return val;
  }
}
