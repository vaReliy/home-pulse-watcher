export interface IFirmwareStorageService {
  uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void>;
  getSignedUrl(gcsPath: string): Promise<string>;
  deleteObject(gcsPath: string): Promise<void>;
}
