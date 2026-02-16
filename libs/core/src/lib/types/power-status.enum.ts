/**
 * Represents the power status of a device.
 * Matches the integer values stored in the database.
 */
export const PowerStatus = {
  OFF: 0,
  ON: 1,
} as const;

export type PowerStatus = (typeof PowerStatus)[keyof typeof PowerStatus];
