/** Signed URL validity window in milliseconds (15 minutes). */
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

export interface IFirmwareStorageService {
  uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void>;
  getSignedUrl(gcsPath: string): Promise<string>;
  deleteObject(gcsPath: string): Promise<void>;
}
