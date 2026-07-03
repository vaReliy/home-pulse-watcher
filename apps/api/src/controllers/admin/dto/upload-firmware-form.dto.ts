/** Non-file multipart fields for the admin firmware upload form. */
export class UploadFirmwareFormDto {
  version!: string;
  board!: string;
  channel!: string;
  /** Checkbox value arrives as the string `"true"` or is omitted entirely. */
  critical?: string;
}
