import express from "express";
import multer from "multer";
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

// --- CONFIGURATION ---
// IMPORTANT: For production, use environment variables instead of hardcoding credentials.
const CONFIG: any = {
  "london-2": {
    endpoint: "https://london-2.linodeobjects.com",
    accessKeyId: process.env.LONDON_ACCESS_KEY || "p2dBRKz25ZlneVec5G",
    secretAccessKey: process.env.LONDON_SECRET_KEY || "YOUR_SECRET_HERE",
  },
  "los-angeles": {
    endpoint: "https://j7y2.la5.idrivee2-8.com",
    accessKeyId: process.env.LA_ACCESS_KEY || "RNUkKDiBGz8FAucnpMd9",
    secretAccessKey: process.env.LA_SECRET_KEY || "btkGwzELYtXDCSAwmjcl9dIZ8WAJQsNcAXigjbIn",
  },
};

const BUCKETS: Record<string, string[]> = {
  "london-2": ["london-files", "london-2-image"],
  "los-angeles": ["los-angeles-files", "los-angeles-image"],
};

// --- EXPRESS & MULTER SETUP ---
const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });

// --- HELPER FUNCTIONS ---

// Gets S3 client for a region, ensuring the region is valid
const getS3 = (region: string) => {
  if (!CONFIG[region]) {
    throw new Error(`Invalid region specified: ${region}`);
  }
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

// Sanitizes a filename to be safe for use as an S3 key
const sanitizeFilename = (filename: string) => {
  return path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

const getFileInfo = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.html': 'text/html',
    '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
    '.xml': 'application/xml', '.csv': 'text/csv', '.md': 'text/markdown',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');
  const isText = mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('javascript');
  const isPdf = mimeType === 'application/pdf';
  
  const isViewable = isImage || isVideo || isAudio || isText || isPdf;

  const icons: { [key: string]: string } = {
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.webp': '🖼️', '.svg': '🖼️',
    '.pdf': '📄', '.txt': '📝', '.html': '🌐', '.css': '🎨', '.js': '⚡', '.json': '📋',
    '.mp4': '🎬', '.webm': '🎬', '.mov': '🎬', '.mp3': '🎵', '.wav': '🎵', '.ogg': '🎵',
    '.zip': '📦', '.rar': '📦', '.doc': '📘', '.docx': '📘', '.xls': '📊', '.xlsx': '📊',
  };
  const icon = icons[ext] || '📎';
  
  return { mimeType, isImage, isVideo, isAudio, isText, isPdf, isViewable, icon };
};

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
};

// --- MIDDLEWARE for Validation ---
const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { region, bucket }: any = req.params;
  if (!CONFIG[region]) {
    return res.status(400).json({ error: `Invalid region: ${region}` });
  }
  if (!BUCKETS[region]?.includes(bucket)) {
    return res.status(400).json({ error: `Invalid bucket '${bucket}' for region '${region}'` });
  }
  next();
};

// --- FRONTEND ROUTE ---
app.get("/", (req, res) => {
  const regionOptions = Object.keys(CONFIG)
    .map((region) => `<option value="${region}">${region}</option>`)
    .join("");

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>IDrive e2 Engineering Marvel 🚀</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          :root { --status-bar-height: 50px; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f6; min-height: 100vh; padding-top: var(--status-bar-height); }
          #status-bar { position: fixed; top: 0; left: 0; width: 100%; height: var(--status-bar-height); background: #333; color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; z-index: 1000; transform: translateY(-100%); transition: transform 0.3s ease-in-out; }
          #status-bar.success { background: linear-gradient(135deg, #28a745, #20c997); }
          #status-bar.error { background: linear-gradient(135deg, #dc3545, #d70d37); }
          #status-bar.visible { transform: translateY(0); }
          .container { max-width: 1200px; margin: 20px auto; background: white; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
          .header { background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 30px; text-align: center; }
          .header h1 { font-size: 2.2em; margin-bottom: 10px; }
          .content { padding: 30px; }
          .upload-section { background: #f8f9fa; border-radius: 15px; padding: 30px; margin-bottom: 30px; border: 2px dashed #dee2e6; }
          .form-group { margin: 20px 0; }
          label { display: block; margin-bottom: 8px; font-weight: 600; color: #333; }
          select, input[type="file"] { width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 8px; font-size: 16px; }
          .upload-btn { background: linear-gradient(135deg, #007bff, #0056b3); color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 10px; cursor: pointer; transition: all 0.3s ease; width: 100%; }
          .upload-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 15px rgba(0, 123, 255, 0.25); }
          .upload-btn:disabled { background: #6c757d; cursor: not-allowed; }
          .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-top: 20px; }
          .file-item { background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 15px; text-align: center; transition: all 0.3s ease; }
          .file-item:hover { transform: translateY(-5px); box-shadow: 0 8px 25px rgba(0,0,0,0.08); }
          .file-icon { font-size: 3em; margin-bottom: 10px; }
          .file-name { font-weight: 600; color: #333; margin-bottom: 5px; word-break: break-all; font-size: 14px; }
          .file-size { color: #666; font-size: 12px; margin-bottom: 15px; }
          .file-actions { display: flex; gap: 10px; justify-content: center; }
          .action-btn { padding: 8px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.3s ease; color: white; }
          .view-btn { background: #28a745; } .view-btn:hover { background: #218838; }
          .download-btn { background: #007bff; } .download-btn:hover { background: #0056b3; }
          .loading { text-align: center; padding: 40px; color: #666; font-size: 18px; }
        </style>
      </head>
      <body>
        <div id="status-bar"></div>
        <div class="container">
          <div class="header"><h1>IDrive e2 File Marvel 🚀</h1><p>Efficiently Manage Your Cloud Storage</p></div>
          <div class="content">
            <div class="upload-section">
              <form id="uploadForm" enctype="multipart/form-data">
                <div class="form-group"><label>1. Select Region:</label><select name="region" id="region">${regionOptions}</select></div>
                <div class="form-group"><label>2. Select Bucket:</label><select name="bucket" id="bucket"></select></div>
                <div class="form-group"><label>3. Choose File:</label><input type="file" name="file" id="fileInput" required /></div>
                <button type="submit" class="upload-btn">🚀 Upload File</button>
              </form>
            </div>
            <div class="file-browser"><h2>File Browser</h2><div id="fileList"><p class="loading">Select a region and bucket, then click 'Browse'.</p></div></div>
          </div>
        </div>
        <script>
          const buckets = ${JSON.stringify(BUCKETS)};
          const regionSelect = document.getElementById("region");
          const bucketSelect = document.getElementById("bucket");
          const uploadForm = document.getElementById("uploadForm");
          const fileList = document.getElementById("fileList");
          const statusBar = document.getElementById("status-bar");
          
          let currentRegion = regionSelect.value;
          let currentBucket = '';

          function showStatus(message, isError = false) {
            statusBar.textContent = message;
            statusBar.className = isError ? 'error visible' : 'success visible';
            setTimeout(() => { statusBar.classList.remove('visible'); }, 4000);
          }

          function updateBuckets() {
            currentRegion = regionSelect.value;
            bucketSelect.innerHTML = buckets[currentRegion].map(b => \`<option value="\${b}">\${b}</option>\`).join('');
            currentBucket = bucketSelect.value;
            browseBucket();
          }

          function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return \`\${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} \${sizes[i]}\`;
          }

          async function browseBucket() {
            currentRegion = regionSelect.value;
            currentBucket = bucketSelect.value;
            if (!currentRegion || !currentBucket) return;
            
            fileList.innerHTML = '<p class="loading">⏳ Loading files...</p>';
            try {
              const response = await fetch(\`/api/list/\${currentRegion}/\${currentBucket}\`);
              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch files.');
              }
              const files = await response.json();
              
              if (files.length === 0) {
                fileList.innerHTML = '<p class="loading">📭 This bucket is empty.</p>';
                return;
              }
              
              fileList.innerHTML = '<div class="file-grid">' + files.map(file => \`
                <div class="file-item">
                  <div class="file-icon">\${file.icon}</div>
                  <div class="file-name">\${file.name}</div>
                  <div class="file-size">\${formatFileSize(file.size)}</div>
                  <div class="file-actions">
                    \${file.isViewable ? \`<button class="action-btn view-btn" onclick="window.open('/view/\${currentRegion}/\${currentBucket}/\${encodeURIComponent(file.name)}', '_blank')">View</button>\` : ''}
                    <a href="/download/\${currentRegion}/\${currentBucket}/\${encodeURIComponent(file.name)}" class="action-btn download-btn" download>Download</a>
                  </div>
                </div>\`).join('') + '</div>';
            } catch (error) {
              fileList.innerHTML = \`<p class="loading" style="color: red;">❌ \${error.message}</p>\`;
              showStatus(error.message, true);
            }
          }

          regionSelect.addEventListener('change', updateBuckets);
          bucketSelect.addEventListener('change', browseBucket);

          uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const uploadBtn = uploadForm.querySelector('.upload-btn');
            const fileInput = document.getElementById('fileInput');
            if (fileInput.files.length === 0) {
                showStatus('Please select a file to upload.', true);
                return;
            }

            const formData = new FormData(uploadForm);
            uploadBtn.textContent = '⏳ Uploading...';
            uploadBtn.disabled = true;
            
            try {
              const response = await fetch('/upload', { method: 'POST', body: formData });
              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'An unknown error occurred.');
              }
              
              showStatus('✅ ' + result.message);
              fileInput.value = ''; // Reset file input
              browseBucket(); // Refresh the list
              
            } catch (error) {
              showStatus('🔥 ' + error.message, true);
            } finally {
              uploadBtn.textContent = '🚀 Upload File';
              uploadBtn.disabled = false;
            }
          });

          // Initial load
          updateBuckets();
        </script>
      </body>
    </html>
  `);
});

// --- API ROUTES ---

// LIST Files
app.get("/api/list/:region/:bucket", validateRequest, async (req, res) => {
  const { region, bucket } = req.params;
  try {
    const s3 = getS3(region!);
    const command = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const response = await s3.send(command);
    const files = (response.Contents || []).map(obj => {
      const fileInfo = getFileInfo(obj.Key || '');
      return {
        name: obj.Key,
        size: obj.Size || 0,
        lastModified: obj.LastModified,
        ...fileInfo,
      };
    }).sort((a, b) => a.name!.localeCompare(b.name!));
    res.json(files);
  } catch (err) {
    console.error(`[ERROR] Listing ${region}/${bucket}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// UPLOAD File (Streamed)
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const { region, bucket } = req.body;
  if (!region || !bucket) return res.status(400).json({ error: "Region and bucket must be selected."});
  
  const sanitizedFilename = sanitizeFilename(req.file.originalname);
  const tempFilePath = req.file.path;
  
  try {
    const s3 = getS3(region);
    const fileStream = fs.createReadStream(tempFilePath);
    
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: sanitizedFilename,
        Body: fileStream,
        ContentLength: req.file.size,
        ContentType: req.file.mimetype,
    }));
    
    res.json({ success: true, message: `File '${sanitizedFilename}' uploaded successfully!` });
  } catch (err) {
    console.error(`[ERROR] Uploading to ${region}/${bucket}:`, err);
    res.status(500).json({ error: (err as Error).message });
  } finally {
    fs.unlink(tempFilePath, (err) => { // Clean up temp file
        if (err) console.error(`[ERROR] Failed to delete temp file ${tempFilePath}:`, err);
    });
  }
});


// Generic File Handler (used by view, download, raw)
const handleFileRequest = async (req: express.Request, res: express.Response, disposition: 'inline' | 'attachment') => {
  const { region, bucket, filename } = req.params;
  const decodedFilename = decodeURIComponent(filename!);
  
  try {
    const s3 = getS3(region!);
    const command = new GetObjectCommand({ Bucket: bucket, Key: decodedFilename });
    const response = await s3.send(command) as GetObjectCommandOutput;
    
    res.setHeader("Content-Type", response.ContentType || getFileInfo(decodedFilename).mimeType);
    res.setHeader("Content-Length", response.ContentLength?.toString() || '');
    res.setHeader("Content-Disposition", `${disposition}; filename="${decodedFilename}"`);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    
    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else {
      throw new Error("Could not get readable stream for file.");
    }
  } catch (err) {
    console.error(`[ERROR] Fetching file ${decodedFilename}:`, err);
    res.status(404).send(`<h1>File not found</h1><p>${(err as Error).message}</p>`);
  }
};


// RAW - Serve file directly for embedding (PDFs, videos)
app.get("/raw/:region/:bucket/:filename", validateRequest, async (req, res) => {
    await handleFileRequest(req, res, 'inline');
});

// DOWNLOAD - Force download prompt
app.get("/download/:region/:bucket/:filename", validateRequest, async (req, res) => {
    await handleFileRequest(req, res, 'attachment');
});

// VIEW - Smart viewer for different file types
app.get("/view/:region/:bucket/:filename", validateRequest, async (req, res) => {
    const { region, bucket, filename } = req.params;
    const decodedFilename = decodeURIComponent(filename!);
    const fileInfo = getFileInfo(decodedFilename);
    const rawUrl = `/raw/${region}/${bucket}/${encodeURIComponent(decodedFilename)}`;

    const createViewer = (title: string, body: string) => `
        <!DOCTYPE html><html lang="en"><head><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{margin:0;font-family:sans-serif;background:#1e1e1e;} .header{background:#333;color:white;padding:15px;text-align:center;font-size:18px;} .content{height:calc(100vh - 55px);width:100%;} iframe,video,pre{height:100%;width:100%;border:0;}</style></head>
        <body><div class="header">${title}</div><div class="content">${body}</div></body></html>`;

    if (fileInfo.isPdf || fileInfo.isVideo || fileInfo.isAudio) {
        const embedTag = fileInfo.isPdf 
            ? `<iframe src="${rawUrl}"></iframe>`
            : fileInfo.isVideo
            ? `<video controls style="background:black;"><source src="${rawUrl}" type="${fileInfo.mimeType}"></video>`
            : `<audio controls><source src="${rawUrl}" type="${fileInfo.mimeType}"></audio>`;
        res.send(createViewer(decodedFilename, embedTag));
    } else if (fileInfo.isText) {
        try {
            const s3 = getS3(region!);
            const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: decodedFilename }));
            const content = (await streamToBuffer(response.Body as Readable)).toString('utf-8');
            const sanitizedContent = content.replace(/</g, '<').replace(/>/g, '>');
            res.send(createViewer(decodedFilename, `<pre style="white-space:pre-wrap;color:white;padding:1em;">${sanitizedContent}</pre>`));
        } catch (err) {
            res.status(404).send("File not found");
        }
    } else { // For images and other types, just serve them directly
        await handleFileRequest(req, res, 'inline');
    }
});


// --- SERVER START ---
app.listen(port, () => {
  console.log(`🚀 IDrive e2 Engineering Marvel running at http://localhost:${port}`);
  console.log("✅ Now with streaming uploads, better UI, and robust error handling.");
});