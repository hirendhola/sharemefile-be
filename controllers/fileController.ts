import fs from "fs";
import { Readable } from "stream";
import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { Response } from "express";
import type {
  RegionRequest,
  FileRequest,
  UploadRequest,
  FileInfo,
  StreamDisposition,
} from "../types";
import { getS3 } from "../utils/gets3";
import { getFileInfoFromName } from "../utils/getFileInfoFromName";
import { sanitizeFilename } from "../utils/sanitizeFilename";

export const listFilesController = async (req: RegionRequest, res: Response) => {
  const { region, bucket } = req.params;
  try {
    const s3 = getS3(region);
    const command = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const response = await s3.send(command);

    const files: FileInfo[] = (response.Contents || [])
      .filter((obj): obj is typeof obj & { Key: string } => typeof obj.Key === "string")
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
};

export const uploadFileController = async (req: UploadRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

  const { region, bucket } = req.body;
  if (!region || !bucket) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Region and bucket must be selected." });
  }

  const sanitizedFilename = sanitizeFilename(req.file.originalname);
  const tempFilePath = req.file.path;
  const correctMimeType = getFileInfoFromName(sanitizedFilename).mimeType;

  try {
    const s3 = getS3(region);
    const fileStream = fs.createReadStream(tempFilePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: sanitizedFilename,
        Body: fileStream,
        ContentLength: req.file.size,
        ContentType: correctMimeType,
      })
    );

    res.status(201).json({ success: true, message: `File '${sanitizedFilename}' uploaded successfully!` });
  } catch (err) {
    console.error(`[ERROR] Uploading to ${region}/${bucket}:`, err);
    res.status(500).json({ error: (err as Error).message });
  } finally {
    fs.unlink(tempFilePath, (err) => {
      if (err) console.error(`[ERROR] Failed to delete temp file ${tempFilePath}:`, err);
    });
  }
};

export const handleFileStream = async (
  req: FileRequest,
  res: Response,
  disposition: StreamDisposition
) => {
  const { region, bucket, filename } = req.params;
  const decodedFilename = decodeURIComponent(filename);

  try {
    const s3 = getS3(region);
    const command = new GetObjectCommand({ Bucket: bucket, Key: decodedFilename });
    const response = await s3.send(command);

    const mimeType = getFileInfoFromName(decodedFilename).mimeType;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", response.ContentLength?.toString() ?? "");
    res.setHeader("Cache-Control", "public, max-age=31536000");

    if (disposition === "attachment") {
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
