export const ReleaseChannel = {
  ALPHA: 'ALPHA',
  BETA: 'BETA',
  STABLE: 'STABLE',
} as const;

export type ReleaseChannel =
  (typeof ReleaseChannel)[keyof typeof ReleaseChannel];
