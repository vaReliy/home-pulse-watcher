import {
  encryptDeviceSecret,
  decryptDeviceSecret,
} from './device-secret.crypto.js';

describe('device-secret.crypto', () => {
  // 32 bytes = 64 hex characters
  const validKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testSecret = 'a'.repeat(64); // 64-char hex secret

  describe('encryptDeviceSecret', () => {
    it('should return iv:authTag:ciphertext format', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      // IV: 12 bytes = 24 hex chars
      expect(parts[0]).toHaveLength(24);
      // Auth tag: 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext: at least some content
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for same input (random IV)', () => {
      const encrypted1 = encryptDeviceSecret(testSecret, validKey);
      const encrypted2 = encryptDeviceSecret(testSecret, validKey);

      expect(encrypted1).not.toBe(encrypted2);

      // IVs should be different
      const iv1 = encrypted1.split(':')[0];
      const iv2 = encrypted2.split(':')[0];
      expect(iv1).not.toBe(iv2);
    });

    it('should throw on invalid key length - too short', () => {
      const shortKey = 'a'.repeat(62); // 31 bytes

      expect(() => encryptDeviceSecret(testSecret, shortKey)).toThrow(
        'Encryption key must be 32 bytes (64 hex characters)',
      );
    });

    it('should throw on invalid key length - too long', () => {
      const longKey = 'a'.repeat(66); // 33 bytes

      expect(() => encryptDeviceSecret(testSecret, longKey)).toThrow(
        'Encryption key must be 32 bytes (64 hex characters)',
      );
    });

    it('should encrypt different secrets to different ciphertexts', () => {
      const secret1 = 'a'.repeat(64);
      const secret2 = 'b'.repeat(64);

      const encrypted1 = encryptDeviceSecret(secret1, validKey);
      const encrypted2 = encryptDeviceSecret(secret2, validKey);

      // Ciphertexts should be different
      const ciphertext1 = encrypted1.split(':')[2];
      const ciphertext2 = encrypted2.split(':')[2];
      expect(ciphertext1).not.toBe(ciphertext2);
    });
  });

  describe('decryptDeviceSecret', () => {
    it('should decrypt correctly (round-trip)', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const decrypted = decryptDeviceSecret(encrypted, validKey);

      expect(decrypted).toBe(testSecret);
    });

    it('should throw on invalid key length', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const shortKey = 'a'.repeat(62);

      expect(() => decryptDeviceSecret(encrypted, shortKey)).toThrow(
        'Encryption key must be 32 bytes (64 hex characters)',
      );
    });

    it('should throw on wrong key', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const wrongKey =
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      expect(() => decryptDeviceSecret(encrypted, wrongKey)).toThrow();
    });

    it('should throw on invalid format - missing parts', () => {
      expect(() => decryptDeviceSecret('invalid', validKey)).toThrow(
        'Invalid encrypted data format. Expected iv:authTag:ciphertext',
      );
    });

    it('should throw on invalid format - only two parts', () => {
      expect(() => decryptDeviceSecret('part1:part2', validKey)).toThrow(
        'Invalid encrypted data format. Expected iv:authTag:ciphertext',
      );
    });

    it('should throw on invalid IV length', () => {
      // IV should be 24 hex chars (12 bytes), using 20
      const invalidIv = 'a'.repeat(20);
      const validAuthTag = 'b'.repeat(32);
      const validCiphertext = 'c'.repeat(128);

      expect(() =>
        decryptDeviceSecret(
          `${invalidIv}:${validAuthTag}:${validCiphertext}`,
          validKey,
        ),
      ).toThrow('Invalid IV length. Expected 12 bytes');
    });

    it('should throw on invalid auth tag length', () => {
      // Auth tag should be 32 hex chars (16 bytes), using 28
      const validIv = 'a'.repeat(24);
      const invalidAuthTag = 'b'.repeat(28);
      const validCiphertext = 'c'.repeat(128);

      expect(() =>
        decryptDeviceSecret(
          `${validIv}:${invalidAuthTag}:${validCiphertext}`,
          validKey,
        ),
      ).toThrow('Invalid auth tag length. Expected 16 bytes');
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper with ciphertext
      const tamperedCiphertext =
        ciphertext.slice(0, -2) + (ciphertext.slice(-2) === 'ff' ? '00' : 'ff');
      const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;

      expect(() => decryptDeviceSecret(tampered, validKey)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = encryptDeviceSecret(testSecret, validKey);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper with auth tag
      const tamperedAuthTag =
        authTag.slice(0, -2) + (authTag.slice(-2) === 'ff' ? '00' : 'ff');
      const tampered = `${iv}:${tamperedAuthTag}:${ciphertext}`;

      expect(() => decryptDeviceSecret(tampered, validKey)).toThrow();
    });
  });

  describe('round-trip with various secrets', () => {
    it('should handle short secrets', () => {
      const shortSecret = 'abc';
      const encrypted = encryptDeviceSecret(shortSecret, validKey);
      const decrypted = decryptDeviceSecret(encrypted, validKey);

      expect(decrypted).toBe(shortSecret);
    });

    it('should handle long secrets', () => {
      const longSecret = 'x'.repeat(1000);
      const encrypted = encryptDeviceSecret(longSecret, validKey);
      const decrypted = decryptDeviceSecret(encrypted, validKey);

      expect(decrypted).toBe(longSecret);
    });

    it('should handle special characters', () => {
      const specialSecret = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptDeviceSecret(specialSecret, validKey);
      const decrypted = decryptDeviceSecret(encrypted, validKey);

      expect(decrypted).toBe(specialSecret);
    });

    it('should handle unicode characters', () => {
      const unicodeSecret = 'Hello \u4e16\u754c \ud83c\udf0d';
      const encrypted = encryptDeviceSecret(unicodeSecret, validKey);
      const decrypted = decryptDeviceSecret(encrypted, validKey);

      expect(decrypted).toBe(unicodeSecret);
    });
  });
});
