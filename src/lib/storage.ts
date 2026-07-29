import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

// Configure Cloudinary
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  resourceType: string;
}

interface UploadOptions {
  folder?: string;
  transformation?: any;
  resourceType?: "image" | "video" | "raw" | "auto";
  allowedFormats?: string[];
  maxSizeBytes?: number;
}

// Upload file to Cloudinary
export async function uploadFile(
  file: Buffer | string,
  filename: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const {
    folder = "jobtrack",
    transformation,
    resourceType = "auto",
    allowedFormats,
    maxSizeBytes = 10 * 1024 * 1024, // 10MB default
  } = options;

  // Check file size
  if (Buffer.isBuffer(file) && file.length > maxSizeBytes) {
    throw new Error(`File size exceeds limit of ${maxSizeBytes / (1024 * 1024)}MB`);
  }

  // If Cloudinary is not configured, return a mock result
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return {
      url: `https://placeholder.example.com/${folder}/${filename}`,
      publicId: `${folder}/${filename}`,
      format: filename.split(".").pop() || "unknown",
      bytes: Buffer.isBuffer(file) ? file.length : file.length,
      resourceType,
    };
  }

  return new Promise((resolve, reject) => {
    const uploadOptions: any = {
      folder,
      resource_type: resourceType,
      public_id: filename.replace(/\.[^/.]+$/, ""),
    };

    if (transformation) {
      uploadOptions.transformation = transformation;
    }

    if (allowedFormats) {
      uploadOptions.allowed_formats = allowedFormats;
    }

    if (Buffer.isBuffer(file)) {
      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("Upload failed"));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resource_type,
          });
        }
      );
      stream.end(file);
    } else {
      cloudinary.uploader.upload(file, uploadOptions, (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          resourceType: result.resource_type,
        });
      });
    }
  });
}

// Upload image with transformations
export async function uploadImage(
  file: Buffer | string,
  filename: string,
  options?: {
    folder?: string;
    width?: number;
    height?: number;
    quality?: number;
    format?: "auto" | "jpg" | "png" | "webp";
  }
): Promise<UploadResult> {
  const transformation: any[] = [];
  if (options?.width || options?.height) {
    transformation.push({
      width: options.width,
      height: options.height,
      crop: "limit",
    });
  }
  if (options?.quality) {
    transformation.push({ quality: options.quality });
  }

  return uploadFile(file, filename, {
    folder: options?.folder || "jobtrack/images",
    resourceType: "image",
    transformation: transformation.length > 0 ? transformation : undefined,
  });
}

// Delete file from Cloudinary
export async function deleteFile(publicId: string): Promise<boolean> {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return true;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error("Failed to delete file from Cloudinary:", error);
    return false;
  }
}

// Delete multiple files
export async function deleteFiles(publicIds: string[]): Promise<{ deleted: number; failed: number }> {
  if (!env.CLOUDINARY_CLOUD_NAME || publicIds.length === 0) {
    return { deleted: publicIds.length, failed: 0 };
  }

  try {
    const result = await cloudinary.api.delete_resources(publicIds);
    const deleted = Object.values(result.deleted).filter((v) => v === "ok").length;
    return { deleted, failed: publicIds.length - deleted };
  } catch (error) {
    console.error("Failed to delete files from Cloudinary:", error);
    return { deleted: 0, failed: publicIds.length };
  }
}

// Get signed URL for private files
export function getSignedUrl(publicId: string, expiresIn: number = 3600): string {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return `https://placeholder.example.com/${publicId}`;
  }

  return cloudinary.url(publicId, {
    type: "authenticated",
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  });
}

// Generate thumbnail URL
export function getThumbnailUrl(publicId: string, width: number = 200, height: number = 200): string {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return `https://placeholder.example.com/thumbnails/${publicId}`;
  }

  return cloudinary.url(publicId, {
    transformation: [
      { width, height, crop: "thumb", gravity: "face" },
    ],
  });
}

// Optimize image
export function getOptimizedUrl(publicId: string, width?: number, quality: number = 80): string {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return `https://placeholder.example.com/optimized/${publicId}`;
  }

  const transformation: any[] = [{ quality: "auto" }];
  if (width) {
    transformation.unshift({ width, crop: "scale" });
  }

  return cloudinary.url(publicId, {
    transformation,
    format: "auto",
  });
}

// Get resource info
export async function getResourceInfo(publicId: string): Promise<any> {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return null;
  }

  try {
    return await cloudinary.api.resource(publicId);
  } catch (error) {
    console.error("Failed to get resource info:", error);
    return null;
  }
}

// Create folder
export async function createFolder(folderPath: string): Promise<boolean> {
  if (!env.CLOUDINARY_CLOUD_NAME) {
    return true;
  }

  try {
    await cloudinary.api.create_folder(folderPath);
    return true;
  } catch (error: any) {
    if (error.error?.message === "Folder already exists") {
      return true;
    }
    console.error("Failed to create folder:", error);
    return false;
  }
}
