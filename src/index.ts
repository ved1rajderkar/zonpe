import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./lib/env";
import { pinoLogger } from "./middleware/pino-logger";
import { errorHandler } from "./middleware/error-handler";
import { authRoutes } from "./routes/auth.routes";
import { customerRoutes } from "./routes/customers.routes";
import { jobRoutes } from "./routes/jobs.routes";
import { productionRoutes } from "./routes/production.routes";
import { qualityRoutes } from "./routes/quality.routes";
import { dispatchRoutes } from "./routes/dispatch.routes";
import { documentRoutes } from "./routes/documents.routes";
import { reportRoutes } from "./routes/reports.routes";
import { notificationRoutes } from "./routes/notifications.routes";
import { trackingRoutes } from "./routes/tracking.routes";
import { customerPortalRoutes } from "./routes/customer-portal.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { auditRoutes } from "./routes/audit.routes";
import { searchRoutes } from "./routes/search.routes";
import { aiRoutes } from "./routes/ai.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { uploadRoutes } from "./routes/upload.routes";
import { barcodeRoutes } from "./routes/barcode.routes";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/auth";

async function ensureAdminExists() {
  const adminEmail = env.DEFAULT_ADMIN_EMAIL || "admin@zonap.com";
  const adminPassword = env.DEFAULT_ADMIN_PASSWORD || "Admin@123";

  const [existing] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing) return;

  const passwordHash = await hashPassword(adminPassword);
  await db.insert(users).values({
    email: adminEmail,
    passwordHash,
    name: "Admin",
    role: "admin",
    isActive: true,
  });
  console.log(`✅ Default admin created: ${adminEmail}`);
}

const app = new Hono();

app.use("*", cors({
  origin: (origin) => {
    const allowed = env.CORS_ORIGIN || "*";
    if (allowed === "*") return origin || "*";
    return allowed;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
}));

app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", secureHeaders());
app.use("*", pinoLogger);
app.onError(errorHandler);

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.route("/api/auth", authRoutes);
app.route("/api/customers", customerRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/production", productionRoutes);
app.route("/api/quality", qualityRoutes);
app.route("/api/dispatch", dispatchRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/notifications", notificationRoutes);
app.route("/api/tracking", trackingRoutes);
app.route("/api/customer-portal", customerPortalRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/barcode", barcodeRoutes);

app.notFound((c) => {
  return c.json({ error: "Not Found", message: `Route ${c.req.method} ${c.req.path} not found` }, 404);
});

const port = parseInt(env.PORT || "3001", 10);

await ensureAdminExists();

console.log(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
