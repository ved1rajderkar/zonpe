import { Context, Next } from "hono";
import { db } from "../db";
import { auditLogs } from "../db/schema";

interface AuditLogOptions {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
}

// Get client IP
function getClientIP(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return c.req.header("X-Real-IP") || "unknown";
}

// Create audit log entry
export async function createAuditLog(
  userId: string | undefined,
  options: AuditLogOptions,
  c?: Context
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: userId || null,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId || null,
      oldValue: options.oldValue || null,
      newValue: options.newValue || null,
      ipAddress: c ? getClientIP(c) : null,
      userAgent: c ? c.req.header("User-Agent") : null,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

// Audit middleware for automatic logging
export function auditMiddleware(action: string, entityType: string) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    const startTime = Date.now();

    // Store original response
    const originalFetch = c.json.bind(c);

    await next();

    // Log the action after response
    const duration = Date.now() - startTime;

    createAuditLog(user?.id, {
      action,
      entityType,
      entityId: c.req.param("id"),
      newValue: {
        method: c.req.method,
        path: c.req.path,
        duration,
        statusCode: c.res.status,
      },
    }, c);
  };
}

// Specific audit actions
export const AuditActions = {
  // User actions
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",
  USER_REGISTER: "user.register",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",
  USER_PASSWORD_CHANGE: "user.password_change",

  // Job actions
  JOB_CREATE: "job.create",
  JOB_UPDATE: "job.update",
  JOB_DELETE: "job.delete",
  JOB_STATUS_CHANGE: "job.status_change",
  JOB_FILE_UPLOAD: "job.file_upload",

  // Customer actions
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_UPDATE: "customer.update",
  CUSTOMER_DELETE: "customer.delete",

  // Production actions
  PRODUCTION_STEP_START: "production.step_start",
  PRODUCTION_STEP_COMPLETE: "production.step_complete",
  PRODUCTION_ASSIGN: "production.assign",

  // Quality actions
  QUALITY_CHECK_CREATE: "quality.check_create",
  QUALITY_CHECK_UPDATE: "quality.check_update",
  QUALITY_CHECK_PASS: "quality.check_pass",
  QUALITY_CHECK_FAIL: "quality.check_fail",

  // Dispatch actions
  DISPATCH_CREATE: "dispatch.create",
  DISPATCH_UPDATE: "dispatch.update",
  DISPATCH_STATUS_CHANGE: "dispatch.status_change",
  DISPATCH_DELETE: "dispatch.delete",

  // Document actions
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_DELETE: "document.delete",

  // Settings actions
  SETTINGS_UPDATE: "settings.update",
  AUTOMATION_RULE_UPDATE: "automation.rule_update",
} as const;
