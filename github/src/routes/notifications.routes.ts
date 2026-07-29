import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { notifications } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { markNotificationRead, markAllNotificationsRead, getUnreadCount } from "../lib/notifications";

const notificationRoutes = new Hono();

notificationRoutes.use("*", authMiddleware());

// GET / - List notifications
notificationRoutes.get("/", zValidator("query", z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})), async (c) => {
  const user = c.get("user");
  const { status, category, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [eq(notifications.userId, user.id)];
  if (status) conditions.push(eq(notifications.status, status as any));
  if (category) conditions.push(eq(notifications.category, category));

  const whereClause = and(...conditions);

  const [total] = await db.select({ count: count() }).from(notifications).where(whereClause);

  const results = await db
    .select()
    .from(notifications)
    .where(whereClause)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    notifications: results,
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(Number(total.count) / limit),
    },
  });
});

// GET /unread-count - Get unread count
notificationRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const unreadCount = await getUnreadCount(user.id);
  return c.json({ unreadCount });
});

// PUT /:id/read - Mark notification as read
notificationRoutes.put("/:id/read", async (c) => {
  const { id } = c.req.param();
  await markNotificationRead(id);
  return c.json({ message: "Notification marked as read" });
});

// PUT /read-all - Mark all as read
notificationRoutes.put("/read-all", async (c) => {
  const user = c.get("user");
  await markAllNotificationsRead(user.id);
  return c.json({ message: "All notifications marked as read" });
});

// DELETE /:id - Delete notification
notificationRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  await db.delete(notifications).where(eq(notifications.id, id));
  return c.json({ message: "Notification deleted" });
});

// DELETE / - Clear all notifications
notificationRoutes.delete("/", async (c) => {
  const user = c.get("user");
  await db.delete(notifications).where(eq(notifications.userId, user.id));
  return c.json({ message: "All notifications cleared" });
});

export { notificationRoutes };
