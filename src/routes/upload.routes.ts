import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { uploadFile, deleteFile } from "../lib/storage";
import { uploadRateLimit } from "../middleware/rate-limit";

const uploadRoutes = new Hono();

uploadRoutes.use("*", authMiddleware());
uploadRoutes.use("*", uploadRateLimit);

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/zip",
];

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

// POST / - Upload file
uploadRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"] as File;
  const folder = (body["folder"] as string) || "uploads";

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({
      error: "File type not allowed",
      allowed: ALLOWED_TYPES,
    }, 400);
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return c.json({
      error: "File too large",
      maxSize: `${MAX_SIZE / (1024 * 1024)}MB`,
    }, 413);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadFile(buffer, file.name, {
      folder: `jobtrack/${folder}`,
      resourceType: file.type.startsWith("image/") ? "image" : "raw",
    });

    return c.json({
      url: result.url,
      publicId: result.publicId,
      format: result.format,
      size: file.size,
      type: file.type,
      name: file.name,
    }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "Upload failed" }, 500);
  }
});

// POST /multiple - Upload multiple files
uploadRoutes.post("/multiple", async (c) => {
  const body = await c.req.parseBody();
  const folder = (body["folder"] as string) || "uploads";
  const files: File[] = [];

  for (const key of Object.keys(body)) {
    if (body[key] instanceof File) {
      files.push(body[key] as File);
    }
  }

  if (files.length === 0) {
    return c.json({ error: "No files provided" }, 400);
  }

  if (files.length > 10) {
    return c.json({ error: "Maximum 10 files allowed" }, 400);
  }

  const results = [];
  const errors = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push({ file: file.name, error: "File type not allowed" });
      continue;
    }

    if (file.size > MAX_SIZE) {
      errors.push({ file: file.name, error: "File too large" });
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await uploadFile(buffer, file.name, {
        folder: `jobtrack/${folder}`,
        resourceType: file.type.startsWith("image/") ? "image" : "raw",
      });

      results.push({
        url: result.url,
        publicId: result.publicId,
        format: result.format,
        size: file.size,
        type: file.type,
        name: file.name,
      });
    } catch (error: any) {
      errors.push({ file: file.name, error: error.message });
    }
  }

  return c.json({ uploaded: results, errors }, results.length > 0 ? 201 : 400);
});

// DELETE /:publicId - Delete file
uploadRoutes.delete("/:publicId(*)", async (c) => {
  const { publicId } = c.req.param();

  try {
    const deleted = await deleteFile(publicId);
    if (deleted) {
      return c.json({ message: "File deleted" });
    }
    return c.json({ error: "Failed to delete file" }, 500);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export { uploadRoutes };
