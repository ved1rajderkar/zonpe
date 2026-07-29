import { Context, Next } from "hono";
import { extractToken, getUserFromToken, verifyAccessToken, type AuthUser } from "../lib/auth";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

// Extend Hono context type
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// JWT authentication middleware
export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const authorization = c.req.header("Authorization");
    const cookieHeader = c.req.header("Cookie");
    const token = extractToken(authorization, cookieHeader);

    if (!token) {
      return c.json({ error: "Authentication required", message: "No token provided" }, 401);
    }

    const payload = await verifyAccessToken(token);
    if (!payload) {
      return c.json({ error: "Invalid token", message: "Token is invalid or expired" }, 401);
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found", message: "User account not found" }, 401);
    }

    if (!user.isActive) {
      return c.json({ error: "Account disabled", message: "Your account has been disabled" }, 403);
    }

    c.set("user", user);
    await next();
  };
}

// Optional auth middleware (doesn't fail if no token)
export function optionalAuthMiddleware() {
  return async (c: Context, next: Next) => {
    const authorization = c.req.header("Authorization");
    const cookieHeader = c.req.header("Cookie");
    const token = extractToken(authorization, cookieHeader);

    if (token) {
      const payload = await verifyAccessToken(token);
      if (payload) {
        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            avatarUrl: users.avatarUrl,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);

        if (user && user.isActive) {
          c.set("user", user);
        }
      }
    }

    await next();
  };
}

// Role-based access control middleware
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json(
        {
          error: "Insufficient permissions",
          message: `Required role: ${roles.join(" or ")}. Your role: ${user.role}`,
        },
        403
      );
    }

    await next();
  };
}

// Admin only middleware
export function adminOnly() {
  return requireRole("admin");
}

// Production or admin middleware
export function productionOrAdmin() {
  return requireRole("admin", "production");
}

// Quality or admin middleware
export function qualityOrAdmin() {
  return requireRole("admin", "quality");
}

// Dispatch or admin middleware
export function dispatchOrAdmin() {
  return requireRole("admin", "dispatch");
}
