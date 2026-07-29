import QRCode from "qrcode";
import { env } from "./env";

// Generate QR code as data URL (base64)
export async function generateQRCodeDataUrl(data: string, options?: {
  width?: number;
  margin?: number;
  color?: { dark?: string; light?: string };
}): Promise<string> {
  return QRCode.toDataURL(data, {
    width: options?.width || 300,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || "#000000",
      light: options?.color?.light || "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

// Generate QR code as SVG string
export async function generateQRCodeSvg(data: string, options?: {
  width?: number;
  margin?: number;
  color?: { dark?: string; light?: string };
}): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    width: options?.width || 300,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || "#000000",
      light: options?.color?.light || "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

// Generate QR code as PNG buffer
export async function generateQRCodeBuffer(data: string, options?: {
  width?: number;
  margin?: number;
  color?: { dark?: string; light?: string };
}): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    width: options?.width || 300,
    margin: options?.margin || 2,
    color: {
      dark: options?.color?.dark || "#000000",
      light: options?.color?.light || "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}

// Generate job tracking QR code
export async function generateJobTrackingQR(jobId: string, jobNumber: string): Promise<string> {
  const trackingUrl = `${env.FRONTEND_URL}/track/${jobId}`;
  return generateQRCodeDataUrl(trackingUrl, { width: 200, margin: 1 });
}

// Generate QR code for label printing
export async function generateLabelQR(data: string, labelSize: "small" | "medium" | "large" = "medium"): Promise<string> {
  const sizes = { small: 100, medium: 200, large: 400 };
  return generateQRCodeDataUrl(data, { width: sizes[labelSize], margin: 1 });
}

// Generate QR code with logo in center (simplified - just basic QR)
export async function generateBrandedQR(data: string, options?: {
  width?: number;
  brandColor?: string;
}): Promise<string> {
  return generateQRCodeDataUrl(data, {
    width: options?.width || 300,
    color: {
      dark: options?.brandColor || "#1a365d",
      light: "#ffffff",
    },
  });
}
