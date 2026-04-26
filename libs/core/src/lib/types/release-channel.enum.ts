export const ReleaseChannel = {
  ALPHA: 'ALPHA',
  BETA: 'BETA',
  STABLE: 'STABLE',
} as const;

export type ReleaseChannel =
  (typeof ReleaseChannel)[keyof typeof ReleaseChannel];

/**
 * Returns the set of channels visible to a device subscribed to the given channel.
 *
 * Channel visibility (waterfall):
 * - STABLE sees only STABLE
 * - BETA sees BETA + STABLE
 * - ALPHA sees ALPHA + BETA + STABLE
 */
export function channelsVisibleTo(channel: ReleaseChannel): ReleaseChannel[] {
  switch (channel) {
    case ReleaseChannel.STABLE:
      return [ReleaseChannel.STABLE];
    case ReleaseChannel.BETA:
      return [ReleaseChannel.BETA, ReleaseChannel.STABLE];
    case ReleaseChannel.ALPHA:
      return [ReleaseChannel.ALPHA, ReleaseChannel.BETA, ReleaseChannel.STABLE];
    default: {
      const _exhaustive: never = channel;
      throw new Error(`Unhandled ReleaseChannel: ${String(_exhaustive)}`);
    }
  }
}
