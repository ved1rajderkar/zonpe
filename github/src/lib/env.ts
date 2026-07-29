import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default("noreply@jobtrack.com"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("meta-llama/llama-3.1-8b-instruct:free"),
  CORS_ORIGIN: z.string().default("*"),
  PORT: z.string().default("3001"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BASE_URL: z.string().optional().default("http://localhost:3001"),
  FRONTEND_URL: z.string().optional().default("http://localhost:5173"),
  DEFAULT_ADMIN_EMAIL: z.string().default("admin@zonap.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().default("Admin@123"),
});

function loadEnv() {
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(envSchema.shape)) {
    raw[key] = process.env[key];
  }
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    return envSchema.parse({
      DATABASE_URL: "postgresql://localhost:5432/test",
      JWT_SECRET: "test-secret-key-that-is-at-least-32-chars!",
      JWT_REFRESH_SECRET: "test-refresh-secret-key-at-least-32ch!",
    });
  }
  return result.data;
}

export const env = loadEnv();
