import type { AppConfig, BucketConfig } from "../types";

export const CONFIG: AppConfig = {
  "london-2": {
    endpoint: process.env.ENDPOINT_LONDON_2!,
    accessKeyId: process.env.LONDON_ACCESS_KEY!,
    secretAccessKey: process.env.LONDON_SECRET_KEY!,
  },
  "los-angeles": {
    endpoint: process.env.ENDPOINT_LA!,
    accessKeyId: process.env.LA_ACCESS_KEY!,
    secretAccessKey:
      process.env.LA_SECRET_KEY!,
  },
};

export const BUCKETS: BucketConfig = {
  "london-2": ["london-files", "london-2-image"],
  "los-angeles": ["los-angeles-files", "los-angeles-image"],
};