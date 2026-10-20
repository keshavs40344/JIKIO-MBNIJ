export interface StorageUploadResult {
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface IStorageProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  generateSignedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
