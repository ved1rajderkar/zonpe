import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createDriverSchema, updateDriverSchema, driverLoginSchema, paginationSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { drivers, jobs, users, customers, jobTimeline } from "../db/schema";
import { eq, and, desc, count, ilike, or, isNull } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";
import { nanoid } from "nanoid";

export const driverRoutes = new Hono();

// GET / - List all drivers (admin)
driverRoutes.get("/", authMiddleware(), zValidator("query", paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
})), async (c) => {
  try {
    const user = c.get("user");
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { page, limit, search, isActive } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(or(
        ilike(drivers.fullName, `%${search}%`),
        ilike(drivers.driverId, `%${search}%`),
        ilike(drivers.phoneNumber, `%${search}%`),
        ilike(drivers.vehicleNumber, `%${search}%`),
      ));
    }
    if (isActive !== undefined) {
      conditions.push(eq(drivers.isActive, isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [total] = await db.select({ count: count() }).from(drivers).where(where);
    const driverList = await db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        phoneNumber: drivers.phoneNumber,
        driverId: drivers.driverId,
        vehicleNumber: drivers.vehicleNumber,
        isActive: drivers.isActive,
        isOnline: drivers.isOnline,
        assignedJobId: drivers.assignedJobId,
        trackingToken: drivers.trackingToken,
        lastSeen: drivers.lastSeen,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
        assignedJobNumber: jobs.jobNumber,
      })
      .from(drivers)
      .leftJoin(jobs, eq(drivers.assignedJobId, jobs.id))
      .where(where)
      .orderBy(desc(drivers.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      drivers: driverList,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    });
  } catch (error: any) {
    console.error("❌ ERROR IN GET /api/drivers:", error?.message);
    return c.json({
      error: "Failed to fetch drivers",
      details: error?.message || "Unknown error",
    }, 500);
  }
});

// GET /:id - Get single driver
driverRoutes.get("/:id", authMiddleware(), async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const { id } = c.req.param();
  const [driver] = await db
    .select({
      id: drivers.id,
      fullName: drivers.fullName,
      phoneNumber: drivers.phoneNumber,
      driverId: drivers.driverId,
      vehicleNumber: drivers.vehicleNumber,
      isActive: drivers.isActive,
      isOnline: drivers.isOnline,
      assignedJobId: drivers.assignedJobId,
      trackingToken: drivers.trackingToken,
      lastSeen: drivers.lastSeen,
      createdAt: drivers.createdAt,
      updatedAt: drivers.updatedAt,
      assignedJobNumber: jobs.jobNumber,
    })
    .from(drivers)
    .leftJoin(jobs, eq(drivers.assignedJobId, jobs.id))
    .where(eq(drivers.id, id))
    .limit(1);

  if (!driver) {
    return c.json({ error: "Driver not found" }, 404);
  }

  return c.json({ driver });
});

// POST / - Create driver (admin)
driverRoutes.post("/", authMiddleware(), zValidator("json", createDriverSchema), async (c) => {
  console.log("POST /api/drivers - incoming request");
  try {
    const user = c.get("user");
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const data = c.req.valid("json");
    console.log("POST /api/drivers - validated data:", { ...data, pin: "***" });

    // Check for existing driverId or phone
    const [existing] = await db
      .select()
      .from(drivers)
      .where(or(eq(drivers.driverId, data.driverId), eq(drivers.phoneNumber, data.phoneNumber)))
      .limit(1);

    if (existing) {
      if (existing.driverId === data.driverId) {
        return c.json({ error: "Driver ID already exists" }, 409);
      }
      return c.json({ error: "Phone number already registered" }, 409);
    }

    const pinHash = await bcrypt.hash(data.pin, 10);
    const trackingToken = nanoid(32);

    const [created] = await db
      .insert(drivers)
      .values({
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        driverId: data.driverId,
        vehicleNumber: data.vehicleNumber,
        pinHash,
        trackingToken,
      })
      .returning();

    console.log("POST /api/drivers - driver created:", created.id);

    try {
      await createAuditLog(user.id, {
        action: AuditActions.JOB_CREATE,
        entityType: "driver",
        entityId: created.id,
        newValue: {
          id: created.id,
          fullName: created.fullName,
          phoneNumber: created.phoneNumber,
          driverId: created.driverId,
          vehicleNumber: created.vehicleNumber,
          trackingToken: created.trackingToken,
        },
      }, c);
    } catch (auditErr) {
      console.error("Audit log failed (non-fatal):", auditErr);
    }

    return c.json({ driver: { ...created, pinHash: undefined }, message: "Driver created" }, 201);
  } catch (error: any) {
    console.error("❌ CRITICAL ERROR IN POST /api/drivers:", error);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    return c.json({
      error: "Failed to create driver",
      details: error?.message || "Unknown error",
    }, 500);
  }
});

// PUT /:id - Update driver (admin)
driverRoutes.put("/:id", authMiddleware(), zValidator("json", updateDriverSchema), async (c) => {
  try {
    const user = c.get("user");
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { id } = c.req.param();
    const data = c.req.valid("json");

    const [existing] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
    if (!existing) {
      return c.json({ error: "Driver not found" }, 404);
    }

    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.pin) {
      updateData.pinHash = await bcrypt.hash(data.pin, 10);
      delete updateData.pin;
    }

    // If assigning a job, generate new tracking token
    if (data.assignedJobId !== undefined) {
      updateData.trackingToken = data.assignedJobId ? nanoid(32) : null;
    }

    // Remove undefined values to avoid JSONB issues
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    const [updated] = await db
    .update(drivers)
    .set(updateData)
    .where(eq(drivers.id, id))
    .returning();

  return c.json({
    driver: {
      id: updated.id,
      fullName: updated.fullName,
      phoneNumber: updated.phoneNumber,
      driverId: updated.driverId,
      vehicleNumber: updated.vehicleNumber,
      isActive: updated.isActive,
      isOnline: updated.isOnline,
      assignedJobId: updated.assignedJobId,
      trackingToken: updated.trackingToken,
      lastSeen: updated.lastSeen,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
    message: "Driver updated",
  });
  } catch (error: any) {
    console.error("❌ ERROR IN PUT /api/drivers/:id:", error?.message);
    return c.json({ error: "Failed to update driver", details: error?.message }, 500);
  }
});

// DELETE /:id - Delete driver (admin)
driverRoutes.delete("/:id", authMiddleware(), async (c) => {
  try {
    const user = c.get("user");
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const { id } = c.req.param();
    const [existing] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
    if (!existing) {
      return c.json({ error: "Driver not found" }, 404);
    }

    await db.delete(drivers).where(eq(drivers.id, id));

    try {
      await createAuditLog(user.id, {
        action: AuditActions.JOB_DELETE,
        entityType: "driver",
        entityId: id,
        oldValue: {
          id: existing.id,
          fullName: existing.fullName,
          driverId: existing.driverId,
        },
      }, c);
    } catch (auditErr) {
      console.error("Audit log failed (non-fatal):", auditErr);
    }

    return c.json({ message: "Driver deleted" });
  } catch (error: any) {
    console.error("❌ ERROR IN DELETE /api/drivers/:id:", error?.message);
    return c.json({ error: "Failed to delete driver", details: error?.message }, 500);
  }
});

// POST /login - Driver login (no admin auth required, but needs its own token)
driverRoutes.post("/login", zValidator("json", driverLoginSchema), async (c) => {
  const data = c.req.valid("json");
  const inputId = String(data.identifier || "").trim().toLowerCase();
  const inputPin = String(data.pin || "").trim();

  console.log(`🔐 Login attempt for identifier: "${inputId}"`);

  if (!inputId || !inputPin) {
    console.log(`❌ Login rejected: empty identifier or PIN`);
    return c.json({ success: false, error: "Driver ID and PIN are required" }, 400);
  }

  // Fetch all active drivers and match in JS for case-insensitive comparison
  const allDrivers = await db.select().from(drivers).where(eq(drivers.isActive, true));

  const driver = allDrivers.find((d) => {
    const matchesDriverId = d.driverId && String(d.driverId).trim().toLowerCase() === inputId;
    const matchesPhone = d.phoneNumber && String(d.phoneNumber).trim() === inputId;
    const matchesName = d.fullName && String(d.fullName).trim().toLowerCase() === inputId;
    return matchesDriverId || matchesPhone || matchesName;
  });

  if (!driver) {
    console.log(`❌ Login failed: no driver found for identifier "${inputId}"`);
    return c.json({ success: false, error: "Invalid Driver ID/Phone or PIN" }, 401);
  }

  const validPin = await bcrypt.compare(inputPin, driver.pinHash);
  if (!validPin) {
    console.log(`❌ Login failed: invalid PIN for driver "${driver.fullName}" (${driver.driverId})`);
    return c.json({ success: false, error: "Invalid Driver ID/Phone or PIN" }, 401);
  }

  console.log(`✅ Driver authenticated: ${driver.fullName} (${driver.driverId})`);

  // Update online status
  await db.update(drivers).set({ isOnline: true, lastSeen: new Date() }).where(eq(drivers.id, driver.id));

  // Generate a simple JWT-like token for driver session
  const sessionToken = `driver_${nanoid(32)}`;

  return c.json({
    success: true,
    token: driver.trackingToken || sessionToken,
    driver: {
      id: driver.id,
      fullName: driver.fullName,
      phoneNumber: driver.phoneNumber,
      driverId: driver.driverId,
      vehicleNumber: driver.vehicleNumber,
      assignedJobId: driver.assignedJobId,
      trackingToken: driver.trackingToken,
    },
  });
});

// POST /logout - Driver logout
driverRoutes.post("/logout", async (c) => {
  const { driverId } = await c.req.json();
  if (driverId) {
    await db.update(drivers).set({ isOnline: false, lastSeen: new Date() }).where(eq(drivers.id, driverId));
  }
  return c.json({ message: "Logged out" });
});

// POST /location - Update driver location (called by driver)
driverRoutes.post("/location", async (c) => {
  const { driverId, lat, lng, heading, speed, status } = await c.req.json();

  if (!driverId) {
    return c.json({ error: "Driver ID required" }, 400);
  }

  await db.update(drivers).set({
    lastSeen: new Date(),
    isOnline: true,
  }).where(eq(drivers.id, driverId));

  return c.json({ message: "Location updated" });
});

// GET /active-job - Get driver's assigned job (driver auth)
driverRoutes.get("/active-job", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !token.startsWith("driver_")) {
      return c.json({ error: "Driver auth required" }, 401);
    }

    const driverId = token.replace("driver_", "");
    const [driver] = await db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        phoneNumber: drivers.phoneNumber,
        driverId: drivers.driverId,
        vehicleNumber: drivers.vehicleNumber,
        assignedJobId: drivers.assignedJobId,
        trackingToken: drivers.trackingToken,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      return c.json({ error: "Driver not found" }, 404);
    }

    if (!driver.assignedJobId) {
      return c.json({ driver, job: null });
    }

    const [job] = await db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        material: jobs.material,
        grade: jobs.grade,
        quantity: jobs.quantity,
        unit: jobs.unit,
        status: jobs.status,
        priority: jobs.priority,
        dueDate: jobs.dueDate,
        remarks: jobs.remarks,
        customerName: customers.companyName,
      })
      .from(jobs)
      .leftJoin(customers, eq(jobs.customerId, customers.id))
      .where(eq(jobs.id, driver.assignedJobId))
      .limit(1);

    return c.json({ driver, job: job || null });
  } catch (error: any) {
    console.error("❌ ERROR IN GET /api/drivers/active-job:", error?.message);
    return c.json({ error: "Failed to fetch active job", details: error?.message }, 500);
  }
});

// POST /complete-delivery - Mark job as delivered (driver auth)
driverRoutes.post("/complete-delivery", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || !token.startsWith("driver_")) {
      return c.json({ error: "Driver auth required" }, 401);
    }

    const driverId = token.replace("driver_", "");
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);

    if (!driver) {
      return c.json({ error: "Driver not found" }, 404);
    }

    if (!driver.assignedJobId) {
      return c.json({ error: "No active job to complete" }, 400);
    }

    const jobId = driver.assignedJobId;

    // Update job status to delivered
    await db.update(jobs).set({ status: "delivered" }).where(eq(jobs.id, jobId));

    // Clear driver assignment
    await db.update(drivers).set({
      assignedJobId: null,
      trackingToken: null,
      isOnline: false,
      lastSeen: new Date(),
    }).where(eq(drivers.id, driverId));

    // Add timeline entry
    try {
      const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);
      await db.insert(jobTimeline).values({
        jobId,
        status: "delivered",
        description: `Delivered by driver ${driver.fullName} (${driver.driverId})`,
        userId: firstUser?.id,
      });
    } catch (tlErr) {
      console.error("Timeline insert failed (non-fatal):", tlErr);
    }

    return c.json({ message: "Delivery completed", jobId });
  } catch (error: any) {
    console.error("❌ ERROR IN POST /api/drivers/complete-delivery:", error?.message);
    return c.json({ error: "Failed to complete delivery", details: error?.message }, 500);
  }
});
