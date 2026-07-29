import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { searchSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, customers, dispatches } from "../db/schema";
import { or, ilike, eq, and, desc } from "drizzle-orm";

const searchRoutes = new Hono();

searchRoutes.use("*", authMiddleware());

// GET / - Global search
searchRoutes.get("/", zValidator("query", searchSchema), async (c) => {
  const { q, type, limit } = c.req.valid("query");
  const searchLimit = limit || 20;

  const results: Record<string, any[]> = {
    jobs: [],
    customers: [],
    dispatches: [],
  };

  if (!type || type === "all" || type === "jobs") {
    results.jobs = await db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        material: jobs.material,
        quantity: jobs.quantity,
        status: jobs.status,
        priority: jobs.priority,
        type: jobs.jobNumber,
      })
      .from(jobs)
      .where(
        or(
          ilike(jobs.jobNumber, `%${q}%`),
          ilike(jobs.poNumber, `%${q}%`),
          ilike(jobs.material, `%${q}%`),
          ilike(jobs.drawingNumber, `%${q}%`),
          ilike(jobs.barcode, `%${q}%`)
        )
      )
      .limit(searchLimit);
  }

  if (!type || type === "all" || type === "customers") {
    results.customers = await db
      .select({
        id: customers.id,
        companyName: customers.companyName,
        gstNumber: customers.gstNumber,
        industry: customers.industry,
      })
      .from(customers)
      .where(
        or(
          ilike(customers.companyName, `%${q}%`),
          ilike(customers.gstNumber, `%${q}%`),
          ilike(customers.panNumber, `%${q}%`)
        )
      )
      .limit(searchLimit);
  }

  if (!type || type === "all" || type === "dispatches") {
    results.dispatches = await db
      .select({
        id: dispatches.id,
        dispatchNumber: dispatches.dispatchNumber,
        vehicleNumber: dispatches.vehicleNumber,
        status: dispatches.status,
      })
      .from(dispatches)
      .where(
        or(
          ilike(dispatches.dispatchNumber, `%${q}%`),
          ilike(dispatches.vehicleNumber, `%${q}%`),
          ilike(dispatches.lrNumber, `%${q}%`),
          ilike(dispatches.invoiceNumber, `%${q}%`)
        )
      )
      .limit(searchLimit);
  }

  const total = results.jobs.length + results.customers.length + results.dispatches.length;

  return c.json({ results, total, query: q });
});

// GET /quick - Quick search (for autocomplete)
searchRoutes.get("/quick", zValidator("query", z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
})), async (c) => {
  const { q, limit } = c.req.valid("query");

  const jobResults = await db
    .select({
      id: jobs.id,
      label: jobs.jobNumber,
      sublabel: jobs.material,
      type: jobs.status,
    })
    .from(jobs)
    .where(ilike(jobs.jobNumber, `${q}%`))
    .limit(limit);

  const customerResults = await db
    .select({
      id: customers.id,
      label: customers.companyName,
      sublabel: customers.industry,
    })
    .from(customers)
    .where(ilike(customers.companyName, `${q}%`))
    .limit(limit);

  const dispatchResults = await db
    .select({
      id: dispatches.id,
      label: dispatches.dispatchNumber,
      sublabel: dispatches.vehicleNumber,
    })
    .from(dispatches)
    .where(ilike(dispatches.dispatchNumber, `${q}%`))
    .limit(limit);

  return c.json({
    jobs: jobResults,
    customers: customerResults,
    dispatches: dispatchResults,
  });
});

// GET /by-barcode - Search by barcode
searchRoutes.get("/by-barcode", zValidator("query", z.object({
  barcode: z.string().min(1),
})), async (c) => {
  const { barcode } = c.req.valid("query");

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
    return c.json({ error: "No job found with this barcode" }, 404);
  }

  return c.json({
    type: "job",
    data: job,
    trackingUrl: `/track/${job.trackingToken}`,
  });
});

// GET /by-qr - Search by QR code
searchRoutes.get("/by-qr", zValidator("query", z.object({
  qr: z.string().min(1),
})), async (c) => {
  const { qr } = c.req.valid("query");

  // QR code might contain tracking token or job ID
  const [job] = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      trackingToken: jobs.trackingToken,
    })
    .from(jobs)
    .where(
      or(
        eq(jobs.trackingToken, qr),
        eq(jobs.barcode, qr),
        eq(jobs.jobNumber, qr)
      )
    )
    .limit(1);

  if (!job) {
    return c.json({ error: "No job found" }, 404);
  }

  return c.json({
    type: "job",
    data: job,
    trackingUrl: `/track/${job.trackingToken}`,
  });
});

export { searchRoutes };
