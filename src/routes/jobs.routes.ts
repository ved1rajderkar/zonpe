import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createJobSchema, updateJobSchema, jobNoteSchema, paginationSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, jobFiles, jobTimeline, jobNotes, customers, users, productionSteps } from "../db/schema";
import { eq, and, desc, sql, count, ilike, or } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";
import { emitEvent } from "../lib/automation";
import { nanoid } from "nanoid";
import { generateJobTrackingQR } from "../lib/qrcode";
import { generateJobBarcode } from "../lib/barcode";

const jobRoutes = new Hono();

jobRoutes.use("*", authMiddleware());

// GET / - List all jobs
jobRoutes.get("/", zValidator("query", paginationSchema.extend({
  status: z.string().optional(),
  priority: z.string().optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
})), async (c) => {
  const { page, limit, status, priority, customerId, search } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(jobs.status, status as any));
  if (priority) conditions.push(eq(jobs.priority, priority as any));
  if (customerId) conditions.push(eq(jobs.customerId, customerId));
  if (search) {
    conditions.push(
      or(
        ilike(jobs.jobNumber, `%${search}%`),
        ilike(jobs.poNumber, `%${search}%`),
        ilike(jobs.material, `%${search}%`)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [total] = await db.select({ count: count() }).from(jobs).where(whereClause);

  const results = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerId: jobs.customerId,
      customerName: customers.companyName,
      poNumber: jobs.poNumber,
      drawingNumber: jobs.drawingNumber,
      material: jobs.material,
      grade: jobs.grade,
      quantity: jobs.quantity,
      weight: jobs.weight,
      unit: jobs.unit,
      priority: jobs.priority,
      status: jobs.status,
      dueDate: jobs.dueDate,
      estimatedCompletion: jobs.estimatedCompletion,
      remarks: jobs.remarks,
      trackingToken: jobs.trackingToken,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    jobs: results,
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(Number(total.count) / limit),
    },
  });
});

// GET /stats - Job statistics
jobRoutes.get("/stats", async (c) => {
  const [total] = await db.select({ count: count() }).from(jobs);

  const statusCounts = await db
    .select({ status: jobs.status, count: count() })
    .from(jobs)
    .groupBy(jobs.status);

  const priorityCounts = await db
    .select({ priority: jobs.priority, count: count() })
    .from(jobs)
    .groupBy(jobs.priority);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayCount] = await db
    .select({ count: count() })
    .from(jobs)
    .where(sql`${jobs.createdAt} >= ${today}`);

  const [delayedCount] = await db
    .select({ count: count() })
    .from(jobs)
    .where(and(
      sql`${jobs.dueDate} < ${new Date().toISOString()}`,
      sql`${jobs.status} NOT IN ('completed', 'cancelled', 'delivered')`
    ));

  return c.json({
    stats: {
      total: total.count,
      todayCreated: todayCount.count,
      delayed: delayedCount.count,
      byStatus: statusCounts,
      byPriority: priorityCounts,
    },
  });
});

// GET /:id - Get single job
jobRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const [job] = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerId: jobs.customerId,
      customerName: customers.companyName,
      poNumber: jobs.poNumber,
      drawingNumber: jobs.drawingNumber,
      material: jobs.material,
      grade: jobs.grade,
      quantity: jobs.quantity,
      weight: jobs.weight,
      unit: jobs.unit,
      priority: jobs.priority,
      status: jobs.status,
      dueDate: jobs.dueDate,
      estimatedCompletion: jobs.estimatedCompletion,
      remarks: jobs.remarks,
      qrCode: jobs.qrCode,
      barcode: jobs.barcode,
      trackingToken: jobs.trackingToken,
      createdBy: jobs.createdBy,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const files = await db.select().from(jobFiles).where(eq(jobFiles.jobId, id));
  const timeline = await db
    .select({
      id: jobTimeline.id,
      status: jobTimeline.status,
      description: jobTimeline.description,
      createdAt: jobTimeline.createdAt,
      userName: users.name,
    })
    .from(jobTimeline)
    .leftJoin(users, eq(jobTimeline.userId, users.id))
    .where(eq(jobTimeline.jobId, id))
    .orderBy(desc(jobTimeline.createdAt));

  const notes = await db
    .select({
      id: jobNotes.id,
      content: jobNotes.content,
      createdAt: jobNotes.createdAt,
      userName: users.name,
    })
    .from(jobNotes)
    .innerJoin(users, eq(jobNotes.userId, users.id))
    .where(eq(jobNotes.jobId, id))
    .orderBy(desc(jobNotes.createdAt));

  const steps = await db
    .select()
    .from(productionSteps)
    .where(eq(productionSteps.jobId, id))
    .orderBy(productionSteps.stepOrder);

  return c.json({
    job: {
      ...job,
      files,
      timeline,
      notes,
      productionSteps: steps,
    },
  });
});

// POST / - Create job
jobRoutes.post("/", zValidator("json", createJobSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Generate job number
  const year = new Date().getFullYear();
  const [lastJob] = await db
    .select({ jobNumber: jobs.jobNumber })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  let nextNum = 1;
  if (lastJob) {
    const match = lastJob.jobNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const jobNumber = `JOB-${year}-${String(nextNum).padStart(5, "0")}`;

  // Generate tracking token and QR code
  const trackingToken = nanoid(32);
  const trackingUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/track/${trackingToken}`;

  let qrCode = "";
  let barcode = "";
  try {
    qrCode = await generateJobTrackingQR(trackingToken, jobNumber);
    barcode = jobNumber;
  } catch (err) {
    console.error("Failed to generate QR/barcode:", err);
  }

  const [job] = await db
    .insert(jobs)
    .values({
      jobNumber,
      customerId: data.customerId,
      poNumber: data.poNumber,
      drawingNumber: data.drawingNumber,
      material: data.material,
      grade: data.grade,
      quantity: data.quantity,
      weight: data.weight,
      unit: data.unit || "nos",
      priority: data.priority || "medium",
      status: "received",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      estimatedCompletion: data.estimatedCompletion ? new Date(data.estimatedCompletion) : null,
      remarks: data.remarks,
      qrCode,
      barcode,
      trackingToken,
      createdBy: user.id,
    })
    .returning();

  // Create initial timeline entry
  await db.insert(jobTimeline).values({
    jobId: job.id,
    status: "received",
    description: `Job ${jobNumber} created and received`,
    userId: user.id,
  });

  // Trigger automation
  const [customer] = await db.select().from(customers).where(eq(customers.id, data.customerId)).limit(1);
  await emitEvent("job.created", {
    entityType: "job",
    entityId: job.id,
    data: {
      jobNumber,
      customerName: customer?.companyName,
      material: data.material,
      quantity: data.quantity,
      priority: data.priority,
      trackingUrl,
    },
    userId: user.id,
  });

  await createAuditLog(user.id, {
    action: AuditActions.JOB_CREATE,
    entityType: "job",
    entityId: job.id,
    newValue: job,
  }, c);

  return c.json({ job, message: "Job created" }, 201);
});

// PUT /:id - Update job
jobRoutes.put("/:id", zValidator("json", updateJobSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [existing] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Job not found" }, 404);
  }

  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
  if (data.estimatedCompletion) updateData.estimatedCompletion = new Date(data.estimatedCompletion);

  const [updated] = await db
    .update(jobs)
    .set(updateData)
    .where(eq(jobs.id, id))
    .returning();

  // If status changed, create timeline and trigger event
  if (data.status && data.status !== existing.status) {
    await db.insert(jobTimeline).values({
      jobId: id,
      status: data.status,
      description: `Status changed from ${existing.status} to ${data.status}`,
      userId: user.id,
    });

    await emitEvent("job.status_changed", {
      entityType: "job",
      entityId: id,
      data: {
        jobNumber: existing.jobNumber,
        previousStatus: existing.status,
        newStatus: data.status,
        updatedBy: user.name,
      },
      userId: user.id,
    });
  }

  await createAuditLog(user.id, {
    action: AuditActions.JOB_UPDATE,
    entityType: "job",
    entityId: id,
    oldValue: existing,
    newValue: updated,
  }, c);

  return c.json({ job: updated, message: "Job updated" });
});

// DELETE /:id - Delete job
jobRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [existing] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Job not found" }, 404);
  }

  await db.delete(jobs).where(eq(jobs.id, id));

  await createAuditLog(user.id, {
    action: AuditActions.JOB_DELETE,
    entityType: "job",
    entityId: id,
    oldValue: existing,
  }, c);

  return c.json({ message: "Job deleted" });
});

// POST /:id/files - Upload file
jobRoutes.post("/:id/files", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const body = await c.req.parseBody();
  const file = body["file"] as File;
  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // In production, upload to Cloudinary here
  const fileUrl = `https://storage.example.com/jobs/${id}/${file.name}`;

  const [fileRecord] = await db
    .insert(jobFiles)
    .values({
      jobId: id,
      fileName: file.name,
      fileUrl,
      fileType: file.type,
      fileSize: file.size,
      category: (body["category"] as any) || "other",
      uploadedBy: user.id,
    })
    .returning();

  return c.json({ file: fileRecord, message: "File uploaded" }, 201);
});

// POST /:id/notes - Add note
jobRoutes.post("/:id/notes", zValidator("json", jobNoteSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { content } = c.req.valid("json");

  const [note] = await db
    .insert(jobNotes)
    .values({ jobId: id, userId: user.id, content })
    .returning();

  return c.json({ note, message: "Note added" }, 201);
});

// POST /bulk-status - Bulk status update
jobRoutes.post("/bulk-status", zValidator("json", z.object({
  jobIds: z.array(z.string().uuid()),
  status: z.string(),
})), async (c) => {
  const user = c.get("user");
  const { jobIds, status } = c.req.valid("json");

  for (const jobId of jobIds) {
    await db.update(jobs).set({ status: status as any, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    await db.insert(jobTimeline).values({
      jobId,
      status: status as any,
      description: `Bulk status update to ${status}`,
      userId: user.id,
    });
  }

  return c.json({ message: `${jobIds.length} jobs updated to ${status}` });
});

export { jobRoutes };
