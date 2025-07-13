import path from "path";

export const sanitizeFilename = (filename: string): string => {
  return path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, "_");
};