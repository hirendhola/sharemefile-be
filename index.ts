import express, { type Response, type NextFunction } from "express";
import multer from "multer";
import cors from "cors";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

import {
  type AppConfig,
  type BucketConfig,
  type Region,
  type MimeTypeMap,
  type StreamDisposition,
  type UploadRequest,
  type RegionRequest,
  type FileRequest,
  type FileInfo,
} from "./types";

const CONFIG: AppConfig = {
  "london-2": {
    endpoint: "https://london-2.linodeobjects.com",
    accessKeyId: process.env.LONDON_ACCESS_KEY || "p2dBRKz25ZlneVec5G",
    secretAccessKey: process.env.LONDON_SECRET_KEY || "YOUR_SECRET_HERE",
  },
  "los-angeles": {
    endpoint: "https://j7y2.la5.idrivee2-8.com",
    accessKeyId: process.env.LA_ACCESS_KEY || "RNUkKDiBGz8FAucnpMd9",
    secretAccessKey:
      process.env.LA_SECRET_KEY || "btkGwzELYtXDCSAwmjcl9dIZ8WAJQsNcAXigjbIn",
  },
};

const BUCKETS: BucketConfig = {
  "london-2": ["london-files", "london-2-image"],
  "los-angeles": ["los-angeles-files", "los-angeles-image"],
};

const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

const getS3 = (region: Region): S3Client => {
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

const sanitizeFilename = (filename: string): string => {
  return path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, "_");
};

const getFileInfoFromName = (filename: string): { mimeType: string } => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: MimeTypeMap = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  return { mimeType: mimeTypes[ext] || "application/octet-stream" };
};

const validateRequest = (
  req: RegionRequest | FileRequest,
  res: Response,
  next: NextFunction
): void => {
  const { region, bucket } = req.params;
  if (!(region in CONFIG)) {
    res.status(400).json({ error: `Invalid region: ${region}` });
    return;
  }
  if (!BUCKETS[region]?.includes(bucket)) {
    res
      .status(400)
      .json({ error: `Invalid bucket '${bucket}' for region '${region}'` });
    return;
  }
  next();
};

app.get("/api/config", (req, res: Response) => {
  res.json({
    regions: Object.keys(CONFIG),
    buckets: BUCKETS,
  });
});

app.get(
  "/api/files/:region/:bucket",
  validateRequest,
  async (req: RegionRequest, res: Response) => {
    const { region, bucket } = req.params;
    try {
      const s3 = getS3(region);
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1000,
      });
      const response = await s3.send(command);

      const files: FileInfo[] = (response.Contents || [])
        .filter(
          (obj): obj is typeof obj & { Key: string } =>
            typeof obj.Key === "string"
        )
        .map((obj) => ({
          name: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified,
          mimeType: getFileInfoFromName(obj.Key).mimeType,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(files);
    } catch (err) {
      console.error(`[ERROR] Listing ${region}/${bucket}:`, err);
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

app.post("/api/upload", upload.single('file'), async (req: UploadRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded." });
  }

  const { region, bucket } = req.body;
  if (!region || !bucket) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Region and bucket must be selected."});
  }
  
  const sanitizedFilename = sanitizeFilename(req.file.originalname);
  const tempFilePath = req.file.path;
    const correctMimeType = getFileInfoFromName(sanitizedFilename).mimeType;
  
  try {
    const s3 = getS3(region);
    const fileStream = fs.createReadStream(tempFilePath);
    
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: sanitizedFilename,
        Body: fileStream,
        ContentLength: req.file.size,
        ContentType: correctMimeType, // Use our reliable MIME type
    }));
    
    res.status(201).json({ success: true, message: `File '${sanitizedFilename}' uploaded successfully!` });
  } catch (err) {
    console.error(`[ERROR] Uploading to ${region}/${bucket}:`, err);
    res.status(500).json({ error: (err as Error).message });
  } finally {
    fs.unlink(tempFilePath, (err) => {
        if (err) console.error(`[ERROR] Failed to delete temp file ${tempFilePath}:`, err);
    });
  }
});

const handleFileStream = async (req: FileRequest, res: Response, disposition: StreamDisposition) => {
  const { region, bucket, filename } = req.params;
  const decodedFilename = decodeURIComponent(filename);
  
  try {
    const s3 = getS3(region);
    const command = new GetObjectCommand({ Bucket: bucket, Key: decodedFilename });
    const response = await s3.send(command) as GetObjectCommandOutput;
    
    const mimeType = getFileInfoFromName(decodedFilename).mimeType;
    res.setHeader("Content-Type", mimeType);
    
    res.setHeader("Content-Length", response.ContentLength?.toString() ?? '');
    res.setHeader("Cache-Control", "public, max-age=31536000");
    
    if (disposition === 'attachment') {
        res.setHeader("Content-Disposition", `attachment; filename="${decodedFilename}"`);
    }
    
    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else {
      throw new Error("Could not get a readable stream for the file.");
    }
  } catch (err) {
    console.error(`[ERROR] Streaming file ${decodedFilename}:`, err);
    res.status(404).json({ error: "File not found.", details: (err as Error).message });
  }
};

app.get(
  "/api/raw/:region/:bucket/:filename",
  validateRequest,
  async (req: FileRequest, res: Response) => {
    await handleFileStream(req, res, "inline");     
  }
);

app.get(
  "/api/download/:region/:bucket/:filename",
  validateRequest,
  async (req: FileRequest, res: Response) => {
    await handleFileStream(req, res, "attachment");
  }
);

app.listen(port, () => {
  console.log(`✅ Backend API is running on http://localhost:${port}`);
});
