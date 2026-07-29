import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createDispatchSchema, updateDispatchSchema, dispatchStatusSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { dispatches, dispatchPhotos, jobs, customers } from "../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";
import { emitEvent } from "../lib/automation";
import { nanoid } from "nanoid";

const dispatchRoutes = new Hono();

dispatchRoutes.use("*", authMiddleware());

// GET / - List dispatches
dispatchRoutes.get("/", zValidator("query", z.object({
  jobId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})), async (c) => {
  const { jobId, status, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (jobId) conditions.push(eq(dispatches.jobId, jobId));
  if (status) conditions.push(eq(dispatches.status, status as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [total] = await db.select({ count: count() }).from(dispatches).where(whereClause);

  const results = await db
    .select({
      id: dispatches.id,
      dispatchNumber: dispatches.dispatchNumber,
      jobId: dispatches.jobId,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      dispatchType: dispatches.dispatchType,
      quantityDispatched: dispatches.quantityDispatched,
      vehicleNumber: dispatches.vehicleNumber,
      transporterName: dispatches.transporterName,
      lrNumber: dispatches.lrNumber,
      status: dispatches.status,
      dispatchedAt: dispatches.dispatchedAt,
      deliveredAt: dispatches.deliveredAt,
      createdAt: dispatches.createdAt,
    })
    .from(dispatches)
    .leftJoin(jobs, eq(dispatches.jobId, jobs.id))
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(dispatches.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    dispatches: results,
    pagination: { page, limit, total: total.count, totalPages: Math.ceil(Number(total.count) / limit) },
  });
});

// GET /stats - Dispatch statistics
dispatchRoutes.get("/stats", async (c) => {
  const [total] = await db.select({ count: count() }).from(dispatches);

  const statusCounts = await db
    .select({ status: dispatches.status, count: count() })
    .from(dispatches)
    .groupBy(dispatches.status);

  const [totalQuantity] = await db
    .select({ total: sql`coalesce(sum(${dispatches.quantityDispatched}), 0)`.as("total") })
    .from(dispatches);

  const [totalAmount] = await db
    .select({ total: sql`coalesce(sum(${dispatches.invoiceAmount}), 0)`.as("total") })
    .from(dispatches);

  return c.json({
    stats: {
      total: total.count,
      byStatus: statusCounts,
      totalQuantityDispatched: totalQuantity.total,
      totalInvoiceAmount: totalAmount.total,
    },
  });
});

// GET /:id - Get single dispatch
dispatchRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const [dispatch] = await db
    .select({
      id: dispatches.id,
      dispatchNumber: dispatches.dispatchNumber,
      jobId: dispatches.jobId,
      jobNumber: jobs.jobNumber,
      customerId: jobs.customerId,
      customerName: customers.companyName,
      dispatchType: dispatches.dispatchType,
      quantityDispatched: dispatches.quantityDispatched,
      vehicleNumber: dispatches.vehicleNumber,
      transporterName: dispatches.transporterName,
      lrNumber: dispatches.lrNumber,
      lrDate: dispatches.lrDate,
      ewayBillNumber: dispatches.ewayBillNumber,
      driverName: dispatches.driverName,
      driverPhone: dispatches.driverPhone,
      invoiceNumber: dispatches.invoiceNumber,
      invoiceAmount: dispatches.invoiceAmount,
      status: dispatches.status,
      dispatchedAt: dispatches.dispatchedAt,
      deliveredAt: dispatches.deliveredAt,
      createdBy: dispatches.createdBy,
      createdAt: dispatches.createdAt,
    })
    .from(dispatches)
    .leftJoin(jobs, eq(dispatches.jobId, jobs.id))
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(dispatches.id, id))
    .limit(1);

  if (!dispatch) {
    return c.json({ error: "Dispatch not found" }, 404);
  }

  const photos = await db
    .select()
    .from(dispatchPhotos)
    .where(eq(dispatchPhotos.dispatchId, id));

  return c.json({ dispatch: { ...dispatch, photos } });
});

// POST / - Create dispatch
dispatchRoutes.post("/", zValidator("json", createDispatchSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Generate dispatch number
  const year = new Date().getFullYear();
  const [lastDispatch] = await db
    .select({ dispatchNumber: dispatches.dispatchNumber })
    .from(dispatches)
    .orderBy(desc(dispatches.createdAt))
    .limit(1);

  let nextNum = 1;
  if (lastDispatch) {
    const match = lastDispatch.dispatchNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  const dispatchNumber = `DISP-${year}-${String(nextNum).padStart(5, "0")}`;

  // Verify job exists and has enough quantity
  const [job] = await db.select().from(jobs).where(eq(jobs.id, data.jobId)).limit(1);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Check dispatched quantity
  const [alreadyDispatched] = await db
    .select({ total: sql`coalesce(sum(${dispatches.quantityDispatched}), 0)`.as("total") })
    .from(dispatches)
    .where(eq(dispatches.jobId, data.jobId));

  const remaining = job.quantity - Number(alreadyDispatched.total);
  if (data.quantityDispatched > remaining) {
    return c.json({ error: `Only ${remaining} units remaining to dispatch` }, 400);
  }

  const [dispatch] = await db
    .insert(dispatches)
    .values({
      dispatchNumber,
      jobId: data.jobId,
      dispatchType: data.dispatchType || "full",
      quantityDispatched: data.quantityDispatched,
      vehicleNumber: data.vehicleNumber,
      transporterName: data.transporterName,
      lrNumber: data.lrNumber,
      lrDate: data.lrDate ? new Date(data.lrDate) : null,
      ewayBillNumber: data.ewayBillNumber,
      driverName: data.driverName,
      driverPhone: data.driverPhone,
      invoiceNumber: data.invoiceNumber,
      invoiceAmount: data.invoiceAmount,
      createdBy: user.id,
    })
    .returning();

  // Update job status
  await db
    .update(jobs)
    .set({ status: "dispatched", updatedAt: new Date() })
    .where(eq(jobs.id, data.jobId));

  const [customer] = await db.select().from(customers).where(eq(customers.id, job.customerId)).limit(1);

  await emitEvent("dispatch.created", {
    entityType: "dispatch",
    entityId: dispatch.id,
    data: {
      dispatchNumber,
      jobNumber: job.jobNumber,
      customerName: customer?.companyName,
      quantity: data.quantityDispatched,
      transporter: data.transporterName,
      vehicleNumber: data.vehicleNumber,
    },
    userId: user.id,
  });

  await createAuditLog(user.id, {
    action: AuditActions.DISPATCH_CREATE,
    entityType: "dispatch",
    entityId: dispatch.id,
    newValue: dispatch,
  }, c);

  return c.json({ dispatch, message: "Dispatch created" }, 201);
});

// PUT /:id - Update dispatch
dispatchRoutes.put("/:id", zValidator("json", updateDispatchSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [existing] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Dispatch not found" }, 404);
  }

  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.lrDate) updateData.lrDate = new Date(data.lrDate);

  const [updated] = await db
    .update(dispatches)
    .set(updateData)
    .where(eq(dispatches.id, id))
    .returning();

  return c.json({ dispatch: updated, message: "Dispatch updated" });
});

// PUT /:id/status - Update dispatch status
dispatchRoutes.put("/:id/status", zValidator("json", dispatchStatusSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { status } = c.req.valid("json");

  const [existing] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Dispatch not found" }, 404);
  }

  const updateData: any = { status, updatedAt: new Date() };
  if (status === "in_transit") {
    updateData.dispatchedAt = new Date();
  } else if (status === "delivered") {
    updateData.deliveredAt = new Date();
  }

  const [updated] = await db
    .update(dispatches)
    .set(updateData)
    .where(eq(dispatches.id, id))
    .returning();

  // Update job status if delivered
  if (status === "delivered") {
    await db
      .update(jobs)
      .set({ status: "delivered", updatedAt: new Date() })
      .where(eq(jobs.id, existing.jobId));

    const [job] = await db.select().from(jobs).where(eq(jobs.id, existing.jobId)).limit(1);
    const [customer] = await db.select().from(customers).where(eq(customers.id, job?.customerId)).limit(1);

    await emitEvent("dispatch.delivered", {
      entityType: "dispatch",
      entityId: id,
      data: {
        dispatchNumber: existing.dispatchNumber,
        jobNumber: job?.jobNumber,
        customerName: customer?.companyName,
        deliveredAt: new Date().toISOString(),
      },
      userId: user.id,
    });
  }

  if (status !== existing.status) {
    await emitEvent("dispatch.status_changed", {
      entityType: "dispatch",
      entityId: id,
      data: {
        dispatchNumber: existing.dispatchNumber,
        previousStatus: existing.status,
        newStatus: status,
      },
      userId: user.id,
    });
  }

  return c.json({ dispatch: updated, message: "Status updated" });
});

// POST /:id/photos - Add photo
dispatchRoutes.post("/:id/photos", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const body = await c.req.parseBody();
  const file = body["photo"] as File;
  if (!file) {
    return c.json({ error: "No photo provided" }, 400);
  }

  // In production, upload to Cloudinary
  const photoUrl = `https://storage.example.com/dispatches/${id}/${file.name}`;

  const [photo] = await db
    .insert(dispatchPhotos)
    .values({
      dispatchId: id,
      photoUrl,
      caption: body["caption"] as string,
      uploadedBy: user.id,
    })
    .returning();

  return c.json({ photo, message: "Photo added" }, 201);
});

// DELETE /:id - Delete dispatch
dispatchRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [existing] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Dispatch not found" }, 404);
  }

  if (existing.status !== "preparing") {
    return c.json({ error: "Can only delete dispatches in preparing status" }, 400);
  }

  await db.delete(dispatches).where(eq(dispatches.id, id));

  await createAuditLog(user.id, {
    action: AuditActions.DISPATCH_DELETE,
    entityType: "dispatch",
    entityId: id,
    oldValue: existing,
  }, c);

  return c.json({ message: "Dispatch deleted" });
});

// POST /:id/documents - Upload dispatch document (invoice, e-way bill, challan, LR copy, inspection report, vehicle photos, material photos)
dispatchRoutes.post("/:id/documents", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [dispatch] = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1);
  if (!dispatch) {
    return c.json({ error: "Dispatch not found" }, 404);
  }

  const body = await c.req.parseBody();
  const file = body["file"] as File;
  const category = body["category"] as string;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  const allowedCategories = [
    "invoice", "eway_bill", "challan", "lr_copy",
    "inspection_report", "vehicle_photo", "material_photo", "other"
  ];

  if (category && !allowedCategories.includes(category)) {
    return c.json({ error: `Invalid category. Allowed: ${allowedCategories.join(", ")}` }, 400);
  }

  // Upload to Cloudinary
  const { uploadFile } = await import("../lib/storage");
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const result = await uploadFile(buffer, file.name, {
    folder: `jobtrack/dispatches/${id}`,
  });

  // Store in documents table linked to dispatch
  const { documents } = await import("../db/schema");
  const [doc] = await db
    .insert(documents)
    .values({
      entityType: "dispatch",
      entityId: id,
      fileName: file.name,
      fileUrl: result.url,
      fileType: file.type,
      fileSize: file.size,
      category: category || "other",
      uploadedBy: user.id,
    })
    .returning();

  return c.json({ document: doc, message: "Document uploaded" }, 201);
});

// GET /:id/documents - Get dispatch documents
dispatchRoutes.get("/:id/documents", async (c) => {
  const { id } = c.req.param();

  const { documents } = await import("../db/schema");
  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.entityType, "dispatch"),
        eq(documents.entityId, id)
      )
    )
    .orderBy(documents.createdAt);

  return c.json({ documents: docs });
});

export { dispatchRoutes };
