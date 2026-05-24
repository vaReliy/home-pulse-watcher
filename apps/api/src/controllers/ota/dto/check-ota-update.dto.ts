/** Request body for OTA update check. */
export class CheckOtaUpdateDto {
  boardType!: string;
  currentVersion!: string;
  /** channel is accepted for HMAC canonical string compatibility with existing firmware but ignored for channel selection. */
  channel?: string;
}
