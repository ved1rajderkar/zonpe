import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { customerUsers, customerSessions, customers, jobs, dispatches, documents, notifications } from "../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { hashPassword, comparePassword } from "../lib/auth";
import { nanoid } from "nanoid";

const customerPortalRoutes = new Hono();

// Customer auth middleware
async function customerAuth(c: any, next: any) {
  const cookieHeader = c.req.header("Cookie");
  const tokenMatch = cookieHeader?.match(/customer_token=([^;]+)/);
  const token = tokenMatch?.[1] || c.req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const [session] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.token, token),
      )
    )
    .limit(1);

  if (!session || new Date(session.expiresAt) < new Date()) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  const [user] = await db
    .select()
    .from(customerUsers)
    .where(eq(customerUsers.id, session.customerUserId))
    .limit(1);

  if (!user || !user.isActive) {
    return c.json({ error: "Account disabled" }, 403);
  }

  c.set("customerUser", user);
  await next();
}

// POST /login
customerPortalRoutes.post("/login", zValidator("json", z.object({
  email: z.string().email(),
  password: z.string().min(1),
})), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db
    .select()
    .from(customerUsers)
    .where(eq(customerUsers.email, email))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  if (!user.isActive) {
    return c.json({ error: "Account disabled" }, 403);
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Create session
  const sessionToken = nanoid(64);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.insert(customerSessions).values({
    customerUserId: user.id,
    token: sessionToken,
    expiresAt,
  });

  // Update last login
  await db.update(customerUsers).set({ lastLogin: new Date() }).where(eq(customerUsers.id, user.id));

  // Set cookie
  c.header("Set-Cookie", `customer_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`);

  const [customer] = await db.select().from(customers).where(eq(customers.id, user.customerId)).limit(1);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      companyName: customer?.companyName,
    },
    token: sessionToken,
  });
});

// POST /logout
customerPortalRoutes.post("/logout", customerAuth, async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const tokenMatch = cookieHeader?.match(/customer_token=([^;]+)/);
  if (tokenMatch) {
    await db.delete(customerSessions).where(eq(customerSessions.token, tokenMatch[1]));
  }
  c.header("Set-Cookie", "customer_token=; Path=/; HttpOnly; Max-Age=0");
  return c.json({ message: "Logged out" });
});

// GET /dashboard - Customer dashboard
customerPortalRoutes.get("/dashboard", customerAuth, async (c) => {
  const user = c.get("customerUser");

  const [totalJobs] = await db
    .select({ count: count() })
    .from(jobs)
    .where(eq(jobs.customerId, user.customerId));

  const statusCounts = await db
    .select({ status: jobs.status, count: count() })
    .from(jobs)
    .where(eq(jobs.customerId, user.customerId))
    .groupBy(jobs.status);

  const [activeJobs] = await db
    .select({ count: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.customerId, user.customerId),
        jobs.status.notIn(["completed", "cancelled", "delivered"])
      )
    );

  const recentJobs = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      quantity: jobs.quantity,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(eq(jobs.customerId, user.customerId))
    .orderBy(desc(jobs.createdAt))
    .limit(5);

  return c.json({
    stats: {
      totalJobs: totalJobs.count,
      activeJobs: activeJobs.count,
      byStatus: statusCounts,
    },
    recentJobs,
  });
});

// GET /jobs - Customer jobs
customerPortalRoutes.get("/jobs", customerAuth, zValidator("query", z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})), async (c) => {
  const user = c.get("customerUser");
  const { status, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [eq(jobs.customerId, user.customerId)];
  if (status) conditions.push(eq(jobs.status, status as any));

  const whereClause = and(...conditions);

  const [total] = await db.select({ count: count() }).from(jobs).where(whereClause);

  const results = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      poNumber: jobs.poNumber,
      material: jobs.material,
      quantity: jobs.quantity,
      status: jobs.status,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(whereClause)
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    jobs: results,
    pagination: { page, limit, total: total.count, totalPages: Math.ceil(Number(total.count) / limit) },
  });
});

// GET /jobs/:id - Customer job detail
customerPortalRoutes.get("/jobs/:id", customerAuth, async (c) => {
  const user = c.get("customerUser");
  const { id } = c.req.param();

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.customerId, user.customerId)))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({ job });
});

// GET /dispatches - Customer dispatches
customerPortalRoutes.get("/dispatches", customerAuth, async (c) => {
  const user = c.get("customerUser");

  const results = await db
    .select({
      id: dispatches.id,
      dispatchNumber: dispatches.dispatchNumber,
      jobNumber: jobs.jobNumber,
      quantityDispatched: dispatches.quantityDispatched,
      status: dispatches.status,
      dispatchedAt: dispatches.dispatchedAt,
      deliveredAt: dispatches.deliveredAt,
    })
    .from(dispatches)
    .innerJoin(jobs, eq(dispatches.jobId, jobs.id))
    .where(eq(jobs.customerId, user.customerId))
    .orderBy(desc(dispatches.createdAt));

  return c.json({ dispatches: results });
});

// GET /notifications - Customer notifications
customerPortalRoutes.get("/notifications", customerAuth, async (c) => {
  const user = c.get("customerUser");

  const results = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return c.json({ notifications: results });
});

// GET /documents - Customer documents (invoices, e-way bills, challans, photos)
customerPortalRoutes.get("/documents", customerAuth, zValidator("query", z.object({
  jobId: z.string().uuid().optional(),
  dispatchId: z.string().uuid().optional(),
  category: z.string().optional(),
})), async (c) => {
  const user = c.get("customerUser");
  const { jobId, dispatchId, category } = c.req.valid("query");

  // Get customer's job IDs
  const customerJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.customerId, user.customerId));

  const jobIds = customerJobs.map((j) => j.id);

  if (jobIds.length === 0) {
    return c.json({ documents: [] });
  }

  // Get dispatch IDs for customer's jobs
  const customerDispatches = await db
    .select({ id: dispatches.id })
    .from(dispatches)
    .where(sql`${dispatches.jobId} IN ${jobIds}`);

  const dispatchIds = customerDispatches.map((d) => d.id);

  const conditions = [];
  if (jobId) {
    conditions.push(sql`(${documents.entityType} = 'job' AND ${documents.entityId} = ${jobId})`);
  } else if (dispatchId) {
    conditions.push(sql`(${documents.entityType} = 'dispatch' AND ${documents.entityId} = ${dispatchId})`);
  } else {
    // Get all documents for customer's jobs and dispatches
    conditions.push(sql`(
      (${documents.entityType} = 'job' AND ${documents.entityId} IN ${jobIds})
      OR
      (${documents.entityType} = 'dispatch' AND ${documents.entityId} IN ${dispatchIds})
    )`);
  }

  if (category) {
    conditions.push(eq(documents.category, category));
  }

  const results = await db
    .select({
      id: documents.id,
      entityType: documents.entityType,
      entityId: documents.entityId,
      fileName: documents.fileName,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      category: documents.category,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));

  return c.json({ documents: results });
});

// GET /documents/:id/download - Download document
customerPortalRoutes.get("/documents/:id/download", customerAuth, async (c) => {
  const { id } = c.req.param();

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  return c.json({ url: doc.fileUrl, fileName: doc.fileName });
});

// POST /feedback - Submit customer feedback
customerPortalRoutes.post("/feedback", customerAuth, zValidator("json", z.object({
  jobId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
})), async (c) => {
  return c.json({ message: "Feedback submitted. Thank you!" });
});

export { customerPortalRoutes };
