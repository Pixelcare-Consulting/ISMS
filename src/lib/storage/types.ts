export interface StorageUploadInput {
  path: string;
  body: Buffer | string;
  contentType: string;
}

export interface StorageDownloadResult {
  buffer: Buffer;
  contentType?: string;
}

export interface ObjectStorage {
  upload(input: StorageUploadInput): Promise<void>;
  download(path: string): Promise<StorageDownloadResult>;
  remove(path: string): Promise<void>;
}
