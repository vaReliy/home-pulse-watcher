export const BoardType = {
  ESP32_C3: 'esp32c3',
  ESP32_C6: 'esp32c6',
} as const;

export type BoardType = (typeof BoardType)[keyof typeof BoardType];
