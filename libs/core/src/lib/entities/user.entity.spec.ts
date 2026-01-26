import { User } from './user.entity.js';

describe('User', () => {
  const createUser = (overrides?: Partial<ConstructorParameters<typeof User>[0]>) =>
    new User({
      id: 'user-1',
      telegramId: BigInt(123456789),
      username: 'johndoe',
      createdAt: new Date('2024-01-01'),
      ...overrides,
    });

  describe('constructor', () => {
    it('should create user with all properties', () => {
      const user = createUser();

      expect(user.id).toBe('user-1');
      expect(user.telegramId).toBe(BigInt(123456789));
      expect(user.username).toBe('johndoe');
      expect(user.createdAt).toEqual(new Date('2024-01-01'));
    });

    it('should create user with null username', () => {
      const user = createUser({ username: null });

      expect(user.username).toBeNull();
    });
  });
});
