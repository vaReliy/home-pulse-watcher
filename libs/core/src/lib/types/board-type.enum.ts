export const BoardType = {
  ESP32_C3: 'esp32c3',
  ESP32_C6: 'esp32c6',
} as const;

export type BoardType = (typeof BoardType)[keyof typeof BoardType];

/**
 * Type guard: returns true when value is a valid BoardType member.
 * Use this to validate DB-sourced strings before casting.
 */
export function isBoardType(value: unknown): value is BoardType {
  return (Object.values(BoardType) as unknown[]).includes(value);
}
