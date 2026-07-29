import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { reportFilterSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, dispatches, customers, qualityChecks, productionSteps } from "../db/schema";
import { eq, and, desc, sql, count, gte, lte } from "drizzle-orm";
import { generateJobReportExcel, generateCustomerReportExcel, generateDispatchReportExcel, generateDelayReportExcel, generateProductionReportExcel, generateQualityReportExcel } from "../lib/excel";
import { generateJobCardPDF } from "../lib/pdf";

const reportRoutes = new Hono();

reportRoutes.use("*", authMiddleware());

// GET /jobs - Job report
reportRoutes.get("/jobs", zValidator("query", reportFilterSchema), async (c) => {
  const { startDate, endDate, customerId, status, priority, format } = c.req.valid("query");

  const conditions = [];
  if (startDate) conditions.push(gte(jobs.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(jobs.createdAt, new Date(endDate)));
  if (customerId) conditions.push(eq(jobs.customerId, customerId));
  if (status) conditions.push(eq(jobs.status, status as any));
  if (priority) conditions.push(eq(jobs.priority, priority as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      poNumber: jobs.poNumber,
      material: jobs.material,
      grade: jobs.grade,
      quantity: jobs.quantity,
      unit: jobs.unit,
      priority: jobs.priority,
      status: jobs.status,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(jobs.createdAt));

  if (format === "excel") {
    const buffer = generateJobReportExcel(results);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=job-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ report: results, total: results.length });
});

// GET /customers - Customer report
reportRoutes.get("/customers", zValidator("query", reportFilterSchema), async (c) => {
  const { format } = c.req.valid("query");

  const results = await db
    .select({
      id: customers.id,
      companyName: customers.companyName,
      gstNumber: customers.gstNumber,
      industry: customers.industry,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .orderBy(customers.companyName);

  if (format === "excel") {
    const buffer = generateCustomerReportExcel(results);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=customer-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ report: results, total: results.length });
});

// GET /dispatches - Dispatch report
reportRoutes.get("/dispatches", zValidator("query", reportFilterSchema), async (c) => {
  const { startDate, endDate, status, format } = c.req.valid("query");

  const conditions = [];
  if (startDate) conditions.push(gte(dispatches.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(dispatches.createdAt, new Date(endDate)));
  if (status) conditions.push(eq(dispatches.status, status as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: dispatches.id,
      dispatchNumber: dispatches.dispatchNumber,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      dispatchType: dispatches.dispatchType,
      quantityDispatched: dispatches.quantityDispatched,
      vehicleNumber: dispatches.vehicleNumber,
      transporterName: dispatches.transporterName,
      status: dispatches.status,
      dispatchedAt: dispatches.dispatchedAt,
      deliveredAt: dispatches.deliveredAt,
      invoiceAmount: dispatches.invoiceAmount,
      createdAt: dispatches.createdAt,
    })
    .from(dispatches)
    .leftJoin(jobs, eq(dispatches.jobId, jobs.id))
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(dispatches.createdAt));

  if (format === "excel") {
    const buffer = generateDispatchReportExcel(results);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=dispatch-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ report: results, total: results.length });
});

// GET /delays - Delay report
reportRoutes.get("/delays", zValidator("query", reportFilterSchema), async (c) => {
  const { format } = c.req.valid("query");

  const results = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      material: jobs.material,
      quantity: jobs.quantity,
      priority: jobs.priority,
      status: jobs.status,
      dueDate: jobs.dueDate,
      estimatedCompletion: jobs.estimatedCompletion,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        sql`${jobs.dueDate} < ${new Date()}`,
        sql`${jobs.status} NOT IN ('completed', 'cancelled', 'delivered')`
      )
    )
    .orderBy(jobs.dueDate);

  const delayedJobs = results.map((job) => {
    const dueDate = new Date(job.dueDate);
    const today = new Date();
    const diffTime = today.getTime() - dueDate.getTime();
    const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { ...job, daysOverdue };
  });

  if (format === "excel") {
    const buffer = generateDelayReportExcel(delayedJobs);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=delay-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ report: delayedJobs, total: delayedJobs.length });
});

// GET /production - Production report
reportRoutes.get("/production", zValidator("query", reportFilterSchema), async (c) => {
  const { format } = c.req.valid("query");

  const allJobs = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      status: jobs.status,
      priority: jobs.priority,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(desc(jobs.createdAt));

  const steps = await db
    .select({
      id: productionSteps.id,
      jobId: productionSteps.jobId,
      jobNumber: jobs.jobNumber,
      stepName: productionSteps.stepName,
      stepOrder: productionSteps.stepOrder,
      status: productionSteps.status,
      startedAt: productionSteps.startedAt,
      completedAt: productionSteps.completedAt,
      estimatedHours: productionSteps.estimatedHours,
      actualHours: productionSteps.actualHours,
    })
    .from(productionSteps)
    .leftJoin(jobs, eq(productionSteps.jobId, jobs.id))
    .orderBy(productionSteps.stepOrder);

  const summary = {
    totalJobs: allJobs.length,
    completedJobs: allJobs.filter((j) => j.status === "completed").length,
    inProduction: allJobs.filter((j) => j.status === "in_production").length,
    avgCompletionTime: 0,
  };

  if (format === "excel") {
    const buffer = generateProductionReportExcel({ jobs: allJobs, steps, summary });
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=production-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ summary, jobs: allJobs, steps });
});

// GET /quality - Quality report
reportRoutes.get("/quality", zValidator("query", reportFilterSchema), async (c) => {
  const { startDate, endDate, format } = c.req.valid("query");

  const conditions = [];
  if (startDate) conditions.push(gte(qualityChecks.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(qualityChecks.createdAt, new Date(endDate)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: qualityChecks.id,
      jobId: qualityChecks.jobId,
      jobNumber: jobs.jobNumber,
      checkType: qualityChecks.checkType,
      status: qualityChecks.status,
      defectsFound: qualityChecks.defectsFound,
      defectDescription: qualityChecks.defectDescription,
      checkedAt: qualityChecks.checkedAt,
      createdAt: qualityChecks.createdAt,
    })
    .from(qualityChecks)
    .leftJoin(jobs, eq(qualityChecks.jobId, jobs.id))
    .where(whereClause)
    .orderBy(desc(qualityChecks.createdAt));

  if (format === "excel") {
    const buffer = generateQualityReportExcel(results);
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename=quality-report-${Date.now()}.xlsx`);
    return c.body(buffer);
  }

  return c.json({ report: results, total: results.length });
});

// GET /job-card/:id - Generate job card PDF
reportRoutes.get("/job-card/:id", async (c) => {
  const { id } = c.req.param();

  const [job] = await db
    .select({
      jobNumber: jobs.jobNumber,
      poNumber: jobs.poNumber,
      drawingNumber: jobs.drawingNumber,
      material: jobs.material,
      grade: jobs.grade,
      quantity: jobs.quantity,
      unit: jobs.unit,
      priority: jobs.priority,
      status: jobs.status,
      dueDate: jobs.dueDate,
      remarks: jobs.remarks,
      customerName: customers.companyName,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  try {
    const pdfBuffer = await generateJobCardPDF({
      ...job,
      dueDate: job.dueDate ? new Date(job.dueDate).toLocaleDateString() : undefined,
    });
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `attachment; filename=job-card-${job.jobNumber}.pdf`);
    return c.body(pdfBuffer);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// GET /revenue - Revenue report
reportRoutes.get("/revenue", zValidator("query", reportFilterSchema), async (c) => {
  const { startDate, endDate } = c.req.valid("query");

  const conditions = [];
  if (startDate) conditions.push(gte(dispatches.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(dispatches.createdAt, new Date(endDate)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      totalAmount: sql`coalesce(sum(${dispatches.invoiceAmount}), 0)`.as("totalAmount"),
      totalDispatches: count(),
      avgInvoiceAmount: sql`coalesce(avg(${dispatches.invoiceAmount}), 0)`.as("avgInvoiceAmount"),
    })
    .from(dispatches)
    .where(whereClause);

  return c.json({ report: results[0], total: results.length });
});

// GET /:type/export - Export report as Excel
reportRoutes.get("/:type/export", zValidator("query", reportFilterSchema), async (c) => {
  const { type } = c.req.param();
  const params = c.req.valid("query");

  let buffer: Buffer;
  let filename: string;

  switch (type) {
    case "jobs": {
      const results = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
      buffer = generateJobReportExcel(results);
      filename = "job-report.xlsx";
      break;
    }
    case "customers": {
      const results = await db.select().from(customers).orderBy(customers.companyName);
      buffer = generateCustomerReportExcel(results);
      filename = "customer-report.xlsx";
      break;
    }
    default:
      return c.json({ error: "Invalid report type" }, 400);
  }

  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename=${filename}`);
  return c.body(buffer);
});

// GET /recent - Get recent reports
reportRoutes.get("/recent", async (c) => {
  return c.json({
    recent: [
      { type: "jobs", label: "Job Report", lastGenerated: new Date().toISOString() },
      { type: "production", label: "Production Report", lastGenerated: new Date().toISOString() },
      { type: "quality", label: "Quality Report", lastGenerated: new Date().toISOString() },
    ],
  });
});

// POST /generate - Generate a report
reportRoutes.post("/generate", zValidator("json", z.object({
  type: z.string(),
  config: z.record(z.any()).optional(),
})), async (c) => {
  const { type, config } = c.req.valid("json");
  const reportId = `report-${type}-${Date.now()}`;
  return c.json({ id: reportId, type, status: "generated", config });
});

export { reportRoutes };
