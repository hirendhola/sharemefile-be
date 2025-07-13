import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { BUCKETS, CONFIG } from "../constants";
import validateRequest from "../middlewares/validateRequest";
import {
  listFilesController,
  handleFileStream,
  uploadFileController,
} from "../controllers/fileController";
import type {
  FileRequest,
  RegionRequest,
  UploadRequest,
} from "../types";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.get("/config", (req, res) => {
  res.json({ regions: Object.keys(CONFIG), buckets: BUCKETS });
});

router.get(
  "/files/:region/:bucket",
  validateRequest,
  (req: RegionRequest, res) => listFilesController(req, res)
);

router.post(
  "/upload",
  upload.single("file"),
  (req: UploadRequest, res) => uploadFileController(req, res)
);

router.get(
  "/raw/:region/:bucket/:filename",
  validateRequest,
  (req: FileRequest, res) => handleFileStream(req, res, "inline")
);

router.get(
  "/download/:region/:bucket/:filename",
  validateRequest,
  (req: FileRequest, res) => handleFileStream(req, res, "attachment")
);

export default router;
