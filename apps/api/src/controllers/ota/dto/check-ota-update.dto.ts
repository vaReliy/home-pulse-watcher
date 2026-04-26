/** Request body for OTA update check. */
export class CheckOtaUpdateDto {
  boardType!: string;
  currentVersion!: string;
  channel!: string;
}
