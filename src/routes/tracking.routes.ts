import { Hono } from "hono";
import { db } from "../db";
import { jobs, jobTimeline, customers, dispatches } from "../db/schema";
import { eq, desc } from "drizzle-orm";

const trackingRoutes = new Hono();

// GET /:token - Public job tracking (no auth required)
trackingRoutes.get("/:token", async (c) => {
  const { token } = c.req.param();

  const [job] = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      poNumber: jobs.poNumber,
      material: jobs.material,
      grade: jobs.grade,
      quantity: jobs.quantity,
      unit: jobs.unit,
      status: jobs.status,
      priority: jobs.priority,
      dueDate: jobs.dueDate,
      estimatedCompletion: jobs.estimatedCompletion,
      createdAt: jobs.createdAt,
      customerName: customers.companyName,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.trackingToken, token))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Get timeline (limited public view)
  const timeline = await db
    .select({
      id: jobTimeline.id,
      status: jobTimeline.status,
      description: jobTimeline.description,
      createdAt: jobTimeline.createdAt,
    })
    .from(jobTimeline)
    .where(eq(jobTimeline.jobId, job.id))
    .orderBy(desc(jobTimeline.createdAt))
    .limit(10);

  // Get dispatch info
  const jobDispatches = await db
    .select({
      dispatchNumber: dispatches.dispatchNumber,
      status: dispatches.status,
      dispatchedAt: dispatches.dispatchedAt,
      deliveredAt: dispatches.deliveredAt,
    })
    .from(dispatches)
    .where(eq(dispatches.jobId, job.id))
    .orderBy(desc(dispatches.createdAt))
    .limit(5);

  return c.json({
    job: {
      jobNumber: job.jobNumber,
      material: job.material,
      grade: job.grade,
      quantity: job.quantity,
      unit: job.unit,
      status: job.status,
      priority: job.priority,
      dueDate: job.dueDate,
      createdAt: job.createdAt,
      customerName: job.customerName,
    },
    timeline,
    dispatches: jobDispatches,
  });
});

// GET /:token/verify - Verify tracking token
trackingRoutes.get("/:token/verify", async (c) => {
  const { token } = c.req.param();

  const [job] = await db
    .select({ id: jobs.id, jobNumber: jobs.jobNumber })
    .from(jobs)
    .where(eq(jobs.trackingToken, token))
    .limit(1);

  if (!job) {
    return c.json({ valid: false }, 404);
  }

  return c.json({ valid: true, jobNumber: job.jobNumber });
});

// GET /barcode/:barcode - Track by barcode
trackingRoutes.get("/barcode/:barcode", async (c) => {
  const { barcode } = c.req.param();

  const [job] = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      trackingToken: jobs.trackingToken,
    })
    .from(jobs)
    .where(eq(jobs.barcode, barcode))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    jobNumber: job.jobNumber,
    status: job.status,
    trackingUrl: `/track/${job.trackingToken}`,
  });
});

// GET /job-number/:jobNumber - Track by job number
trackingRoutes.get("/job-number/:jobNumber", async (c) => {
  const { jobNumber } = c.req.param();

  const [job] = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      trackingToken: jobs.trackingToken,
    })
    .from(jobs)
    .where(eq(jobs.jobNumber, jobNumber))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    jobNumber: job.jobNumber,
    status: job.status,
    trackingUrl: `/track/${job.trackingToken}`,
  });
});

export { trackingRoutes };
