import { S3Client } from "@aws-sdk/client-s3";
import type { Region } from "../types";
import { CONFIG } from "../constants";

export const getS3 = (region: Region): S3Client => {
  const config = CONFIG[region];
  return new S3Client({
    endpoint: config.endpoint,
    region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};