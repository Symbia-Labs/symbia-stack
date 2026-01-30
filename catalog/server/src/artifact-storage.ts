import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface ArtifactStorageConfig {
  type: 'filesystem' | 's3';
  basePath?: string;
  s3Bucket?: string;
  s3Region?: string;
  maxFileSizeMB: number;
  allowedMimeTypes: string[];
}

const DEFAULT_CONFIG: ArtifactStorageConfig = {
  type: 'filesystem',
  basePath: './artifacts',
  maxFileSizeMB: parseInt(process.env.ARTIFACT_MAX_SIZE_MB || '50', 10),
  allowedMimeTypes: [
    'application/json',
    'application/octet-stream',
    'application/zip',
    'application/gzip',
    'application/x-tar',
    'text/plain',
    'text/yaml',
    'application/x-yaml',
    'text/javascript',
    'application/javascript',
    'image/png',
    'image/jpeg',
    'image/svg+xml',
  ],
};

export class ArtifactStorage {
  private config: ArtifactStorageConfig;

  constructor(config?: Partial<ArtifactStorageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get maxFileSizeBytes(): number {
    return this.config.maxFileSizeMB * 1024 * 1024;
  }

  get allowedMimeTypes(): string[] {
    return this.config.allowedMimeTypes;
  }

  validateFile(size: number, mimeType: string): { valid: boolean; error?: string } {
    if (size > this.maxFileSizeBytes) {
      return { valid: false, error: `File exceeds maximum size of ${this.config.maxFileSizeMB}MB` };
    }
    if (!this.config.allowedMimeTypes.includes(mimeType)) {
      return { valid: false, error: `File type ${mimeType} is not allowed` };
    }
    return { valid: true };
  }

  async save(resourceId: string, filename: string, data: Buffer): Promise<string> {
    if (this.config.type === 's3') {
      return this.saveToS3(resourceId, filename, data);
    }
    return this.saveToFilesystem(resourceId, filename, data);
  }

  async load(storagePath: string): Promise<Buffer> {
    if (this.config.type === 's3') {
      return this.loadFromS3(storagePath);
    }
    return this.loadFromFilesystem(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    if (this.config.type === 's3') {
      return this.deleteFromS3(storagePath);
    }
    return this.deleteFromFilesystem(storagePath);
  }

  private async saveToFilesystem(resourceId: string, filename: string, data: Buffer): Promise<string> {
    const baseDir = this.config.basePath!;
    const resourceDir = path.join(baseDir, resourceId);
    
    await fs.mkdir(resourceDir, { recursive: true });
    
    const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);
    const storedFilename = `${basename}-${hash}${ext}`;
    const filePath = path.join(resourceDir, storedFilename);
    
    await fs.writeFile(filePath, data);
    
    return filePath;
  }

  private async loadFromFilesystem(storagePath: string): Promise<Buffer> {
    return fs.readFile(storagePath);
  }

  private async deleteFromFilesystem(storagePath: string): Promise<void> {
    try {
      await fs.unlink(storagePath);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  private async saveToS3(_resourceId: string, _filename: string, _data: Buffer): Promise<string> {
    throw new Error('S3 storage not implemented. Configure AWS SDK and implement S3 operations.');
  }

  private async loadFromS3(_storagePath: string): Promise<Buffer> {
    throw new Error('S3 storage not implemented. Configure AWS SDK and implement S3 operations.');
  }

  private async deleteFromS3(_storagePath: string): Promise<void> {
    throw new Error('S3 storage not implemented. Configure AWS SDK and implement S3 operations.');
  }
}

export const artifactStorage = new ArtifactStorage();
