import type { Request, Response, NextFunction } from "express";
import type { FileRequest, RegionRequest } from "../types";
import { CONFIG, BUCKETS } from "../constants"; // Ensure BUCKETS is exported from constants

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

  if (!BUCKETS[region] || !BUCKETS[region].includes(bucket)) {
    res
      .status(400)
      .json({ error: `Invalid bucket '${bucket}' for region '${region}'` });
    return;
  }

  next();
};

export default validateRequest;
