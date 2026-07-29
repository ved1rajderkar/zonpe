import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, adminOnly } from "../middleware/auth";
import { db } from "../db";
import { auditLogs, users } from "../db/schema";
import { eq, and, desc, count, gte, lte } from "drizzle-orm";

const auditRoutes = new Hono();

auditRoutes.use("*", authMiddleware());
auditRoutes.use("*", adminOnly());

// GET / - List audit logs
auditRoutes.get("/", zValidator("query", z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})), async (c) => {
  const { userId, action, entityType, entityId, startDate, endDate, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (action) conditions.push(eq(auditLogs.action, action));
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
  if (entityId) conditions.push(eq(auditLogs.entityId, entityId));
  if (startDate) conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(auditLogs.createdAt, new Date(endDate)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [total] = await db.select({ count: count() }).from(auditLogs).where(whereClause);

  const results = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    logs: results,
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(Number(total.count) / limit),
    },
  });
});

// GET /actions - Get distinct actions
auditRoutes.get("/actions", async (c) => {
  const results = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs);

  return c.json({ actions: results.map((r) => r.action) });
});

// GET /entity-types - Get distinct entity types
auditRoutes.get("/entity-types", async (c) => {
  const results = await db
    .selectDistinct({ entityType: auditLogs.entityType })
    .from(auditLogs);

  return c.json({ entityTypes: results.map((r) => r.entityType) });
});

// GET /:id - Get single audit log detail
auditRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const [log] = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.id, id))
    .limit(1);

  if (!log) {
    return c.json({ error: "Audit log not found" }, 404);
  }

  return c.json({ log });
});

export { auditRoutes };
