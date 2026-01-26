/**
 * User domain entity.
 * Represents a Telegram user registered in the system.
 * Pure domain object with no external dependencies.
 */
export class User {
  readonly id: string;
  readonly telegramId: bigint;
  readonly username: string | null;
  readonly createdAt: Date;

  constructor(props: {
    id: string;
    telegramId: bigint;
    username: string | null;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.telegramId = props.telegramId;
    this.username = props.username;
    this.createdAt = props.createdAt;
  }
}
