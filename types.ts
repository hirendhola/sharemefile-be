import type { Request } from "express";

/**
 * Defines the supported region identifiers as a strict string literal type.
 * This is the core fix: it ensures 'Region' can only be a string, not a number.
 */
export type KnownRegion = "london-2" | "los-angeles";

/**
 * Defines the configuration structure for a single S3-compatible region.
 */
export interface RegionConfig {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Defines the application's primary configuration object.
 * By using a mapped type over KnownRegion, we ensure that only our defined
 * regions are valid keys, and `keyof AppConfig` will resolve to the correct string literal type.
 */
export type AppConfig = {
  [K in KnownRegion]: RegionConfig;
};

/**
 * A type representing a valid region, now correctly inferred as "london-2" | "los-angeles".
 * This type is now assignable to the S3Client's `region` property.
 */
export type Region = keyof AppConfig;

/**
 * Defines the structure for mapping regions to their available buckets.
 */
export type BucketConfig = {
  [key in Region]?: string[];
};

/**
 * Represents the structured information for a single file stored in a bucket.
 */
export interface FileInfo {
  name: string;
  size: number;
  lastModified?: Date;
  mimeType: string;
}

/**
 * A type-safe dictionary for mapping file extensions to MIME types.
 */
export type MimeTypeMap = {
  [extension: string]: string;
};

/**
 * Defines the allowed dispositions for file streaming.
 */
export type StreamDisposition = 'inline' | 'attachment';

/**
 * Extends the Express Request type for routes that handle file uploads.
 */
export interface UploadRequestBody {
    region: Region;
    bucket: string;
}
export interface UploadRequest extends Request {
    body: UploadRequestBody;
}

/**
 * Extends the Express Request type for routes with region and bucket params.
 */
export interface RegionRequest extends Request<{ region: Region; bucket: string }> {}

/**
 * Extends the Express Request type for routes with region, bucket, and filename params.
 */
export interface FileRequest extends Request<{ region: Region; bucket: string; filename: string }> {}