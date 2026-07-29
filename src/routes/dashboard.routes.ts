import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, dispatches, customers, productionSteps, qualityChecks } from "../db/schema";
import { eq, and, desc, sql, count, gte, lte } from "drizzle-orm";

const dashboardRoutes = new Hono();

dashboardRoutes.use("*", authMiddleware());

// GET /stats - Dashboard statistics
dashboardRoutes.get("/stats", async (c) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalJobs] = await db.select({ count: count() }).from(jobs);
  const [todayJobs] = await db
    .select({ count: count() })
    .from(jobs)
    .where(gte(jobs.createdAt, today));

  const [delayedJobs] = await db
    .select({ count: count() })
    .from(jobs)
    .where(
      and(
        lte(jobs.dueDate, new Date()),
        sql`${jobs.status} NOT IN ('completed', 'cancelled', 'delivered')`
      )
    );

  const [readyForDispatch] = await db
    .select({ count: count() })
    .from(jobs)
    .where(eq(jobs.status, "ready_for_dispatch"));

  const [inProduction] = await db
    .select({ count: count() })
    .from(jobs)
    .where(eq(jobs.status, "in_production"));

  const [qualityPending] = await db
    .select({ count: count() })
    .from(jobs)
    .where(eq(jobs.status, "quality_check"));

  const [totalDispatches] = await db.select({ count: count() }).from(dispatches);
  const [pendingDispatches] = await db
    .select({ count: count() })
    .from(dispatches)
    .where(eq(dispatches.status, "preparing"));

  const [inTransitDispatches] = await db
    .select({ count: count() })
    .from(dispatches)
    .where(eq(dispatches.status, "in_transit"));

  const [totalCustomers] = await db.select({ count: count() }).from(customers);

  const [totalRevenue] = await db
    .select({ total: sql`coalesce(sum(${dispatches.invoiceAmount}), 0)`.as("total") })
    .from(dispatches)
    .where(eq(dispatches.status, "delivered"));

  return c.json({
    totalJobs: totalJobs.count,
    todayJobs: todayJobs.count,
    delayedJobs: delayedJobs.count,
    readyForDispatch: readyForDispatch.count,
    inProduction: inProduction.count,
    qualityPending: qualityPending.count,
    totalDispatches: totalDispatches.count,
    pendingDispatches: pendingDispatches.count,
    inTransitDispatches: inTransitDispatches.count,
    totalCustomers: totalCustomers.count,
    monthlyRevenue: totalRevenue.total,
    totalRevenue: totalRevenue.total,
  });
});

// GET /charts/status - Job status distribution
dashboardRoutes.get("/charts/status", async (c) => {
  const statusCounts = await db
    .select({
      status: jobs.status,
      count: count(),
    })
    .from(jobs)
    .groupBy(jobs.status);

  return c.json({
    chart: statusCounts.map((s) => ({
      name: s.status.replace(/_/g, " "),
      value: s.count,
    })),
  });
});

// GET /charts/priority - Job priority distribution
dashboardRoutes.get("/charts/priority", async (c) => {
  const priorityCounts = await db
    .select({
      priority: jobs.priority,
      count: count(),
    })
    .from(jobs)
    .groupBy(jobs.priority);

  return c.json({
    chart: priorityCounts.map((p) => ({
      name: p.priority,
      value: p.count,
    })),
  });
});

// GET /charts/monthly - Monthly job trends
dashboardRoutes.get("/charts/monthly", async (c) => {
  const monthlyJobs = await db
    .select({
      month: sql`to_char(${jobs.createdAt}, 'YYYY-MM')`.as("month"),
      count: count(),
    })
    .from(jobs)
    .groupBy(sql`to_char(${jobs.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${jobs.createdAt}, 'YYYY-MM')`)
    .limit(12);

  return c.json({
    chart: monthlyJobs.map((m) => ({
      name: m.month,
      value: m.count,
    })),
  });
});

// GET /charts/customers - Top customers
dashboardRoutes.get("/charts/customers", async (c) => {
  const topCustomers = await db
    .select({
      customerName: customers.companyName,
      jobCount: count(),
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .groupBy(customers.companyName)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return c.json({
    chart: topCustomers.map((c) => ({
      name: c.customerName,
      value: c.jobCount,
    })),
  });
});

// GET /charts/production - Production efficiency
dashboardRoutes.get("/charts/production", async (c) => {
  const productionData = await db
    .select({
      status: productionSteps.status,
      count: count(),
    })
    .from(productionSteps)
    .groupBy(productionSteps.status);

  return c.json({
    chart: productionData.map((p) => ({
      name: p.status.replace(/_/g, " "),
      value: p.count,
    })),
  });
});

// GET /charts/quality - Quality metrics
dashboardRoutes.get("/charts/quality", async (c) => {
  const qualityData = await db
    .select({
      status: qualityChecks.status,
      count: count(),
    })
    .from(qualityChecks)
    .groupBy(qualityChecks.status);

  return c.json({
    chart: qualityData.map((q) => ({
      name: q.status,
      value: q.count,
    })),
  });
});

// GET /today - Today's jobs
dashboardRoutes.get("/today", async (c) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayJobs = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      material: jobs.material,
      quantity: jobs.quantity,
      status: jobs.status,
      priority: jobs.priority,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(gte(jobs.createdAt, today))
    .orderBy(desc(jobs.createdAt));

  return c.json({ jobs: todayJobs });
});

// GET /delayed - Delayed jobs
dashboardRoutes.get("/delayed", async (c) => {
  const delayedJobs = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      material: jobs.material,
      quantity: jobs.quantity,
      status: jobs.status,
      priority: jobs.priority,
      dueDate: jobs.dueDate,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(
      and(
        lte(jobs.dueDate, new Date()),
        sql`${jobs.status} NOT IN ('completed', 'cancelled', 'delivered')`
      )
    )
    .orderBy(jobs.dueDate);

  const jobsWithDaysOverdue = delayedJobs.map((job) => {
    const dueDate = new Date(job.dueDate);
    const today = new Date();
    const diffTime = today.getTime() - dueDate.getTime();
    const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return { ...job, daysOverdue };
  });

  return c.json({ jobs: jobsWithDaysOverdue });
});

// GET /ready - Ready for dispatch
dashboardRoutes.get("/ready", async (c) => {
  const readyJobs = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      material: jobs.material,
      quantity: jobs.quantity,
      priority: jobs.priority,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.status, "ready_for_dispatch"))
    .orderBy(desc(jobs.createdAt));

  return c.json({ jobs: readyJobs });
});

// GET /dispatch-summary - Dispatch summary
dashboardRoutes.get("/dispatch-summary", async (c) => {
  const statusCounts = await db
    .select({
      status: dispatches.status,
      count: count(),
    })
    .from(dispatches)
    .groupBy(dispatches.status);

  const [totalAmount] = await db
    .select({ total: sql`coalesce(sum(${dispatches.invoiceAmount}), 0)`.as("total") })
    .from(dispatches);

  const [totalQuantity] = await db
    .select({ total: sql`coalesce(sum(${dispatches.quantityDispatched}), 0)`.as("total") })
    .from(dispatches);

  return c.json({
    summary: {
      byStatus: statusCounts,
      totalAmount: totalAmount.total,
      totalQuantity: totalQuantity.total,
    },
  });
});

// GET /recent-activity - Recent activity
dashboardRoutes.get("/recent-activity", async (c) => {
  const recentJobs = await db
    .select({
      type: sql`'job'`.as("type"),
      id: jobs.id,
      title: jobs.jobNumber,
      description: sql`${jobs.status}`.as("description"),
      timestamp: jobs.updatedAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.updatedAt))
    .limit(10);

  const recentDispatches = await db
    .select({
      type: sql`'dispatch'`.as("type"),
      id: dispatches.id,
      title: dispatches.dispatchNumber,
      description: dispatches.status,
      timestamp: dispatches.updatedAt,
    })
    .from(dispatches)
    .orderBy(desc(dispatches.updatedAt))
    .limit(10);

  const allActivity = [...recentJobs, ...recentDispatches]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);

  return c.json({ activity: allActivity });
});

// GET /recent-jobs - Recent jobs for dashboard
dashboardRoutes.get("/recent-jobs", async (c) => {
  const limit = parseInt(c.req.query("limit") || "5", 10);

  const recentJobs = await db
    .select({
      id: jobs.id,
      jobId: jobs.jobNumber,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      description: jobs.remarks,
      material: jobs.material,
      quantity: jobs.quantity,
      status: jobs.status,
      priority: jobs.priority,
      dueDate: jobs.dueDate,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);

  return c.json(recentJobs);
});

// GET /upcoming-deliveries - Jobs ready for dispatch or dispatched
dashboardRoutes.get("/upcoming-deliveries", async (c) => {
  const limit = parseInt(c.req.query("limit") || "5", 10);

  const upcoming = await db
    .select({
      id: jobs.id,
      jobId: jobs.jobNumber,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      description: jobs.remarks,
      status: jobs.status,
      priority: jobs.priority,
      dueDate: jobs.dueDate,
      dispatchDate: jobs.dueDate,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(sql`${jobs.status} IN ('ready_for_dispatch', 'dispatched')`)
    .orderBy(jobs.dueDate)
    .limit(limit);

  return c.json(upcoming);
});

// GET /monthly-revenue - Monthly revenue data
dashboardRoutes.get("/monthly-revenue", async (c) => {
  const monthlyRevenue = await db
    .select({
      month: sql`to_char(${dispatches.createdAt}, 'YYYY-MM')`.as("month"),
      revenue: sql`coalesce(sum(${dispatches.invoiceAmount}), 0)`.as("revenue"),
    })
    .from(dispatches)
    .where(eq(dispatches.status, "delivered"))
    .groupBy(sql`to_char(${dispatches.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${dispatches.createdAt}, 'YYYY-MM')`)
    .limit(12);

  return c.json(monthlyRevenue);
});

// GET /jobs-by-status - Job status distribution for chart
dashboardRoutes.get("/jobs-by-status", async (c) => {
  const statusCounts = await db
    .select({
      name: jobs.status,
      value: count(),
    })
    .from(jobs)
    .groupBy(jobs.status);

  return c.json(statusCounts.map((s) => ({
    name: s.name.replace(/_/g, " "),
    value: s.value,
  })));
});

// GET /jobs-by-priority - Job priority distribution for chart
dashboardRoutes.get("/jobs-by-priority", async (c) => {
  const priorityCounts = await db
    .select({
      name: jobs.priority,
      value: count(),
    })
    .from(jobs)
    .groupBy(jobs.priority);

  return c.json(priorityCounts);
});

// GET /production-overview - Production steps overview (last 7 days)
dashboardRoutes.get("/production-overview", async (c) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const overview = await db
    .select({
      day: sql`to_char(${productionSteps.createdAt}, 'Dy')`.as("day"),
      output: sql`count(*) filter (where ${productionSteps.status} = 'completed')`.as("output"),
      target: sql`count(*)`.as("target"),
    })
    .from(productionSteps)
    .where(gte(productionSteps.createdAt, sevenDaysAgo))
    .groupBy(sql`to_char(${productionSteps.createdAt}, 'Dy'), ${productionSteps.createdAt}::date`)
    .orderBy(sql`${productionSteps.createdAt}::date`);

  return c.json(overview);
});

// GET /customer-stats - Customer growth over months
dashboardRoutes.get("/customer-stats", async (c) => {
  const customerStats = await db
    .select({
      month: sql`to_char(${customers.createdAt}, 'YYYY-MM')`.as("month"),
      customers: count(),
    })
    .from(customers)
    .groupBy(sql`to_char(${customers.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${customers.createdAt}, 'YYYY-MM')`)
    .limit(12);

  return c.json(customerStats);
});

// GET /weekly-job-trend - Weekly job trend (completed vs new)
dashboardRoutes.get("/weekly-job-trend", async (c) => {
  const weeklyTrend = await db
    .select({
      month: sql`to_char(${jobs.createdAt}, 'Mon')`.as("month"),
      completed: sql`count(*) filter (where ${jobs.status} = 'completed')`.as("completed"),
      new: sql`count(*) filter (where ${jobs.status} = 'received')`.as("new"),
    })
    .from(jobs)
    .groupBy(sql`to_char(${jobs.createdAt}, 'Mon'), date_trunc('month', ${jobs.createdAt})`)
    .orderBy(sql`date_trunc('month', ${jobs.createdAt})`)
    .limit(12);

  return c.json(weeklyTrend);
});

// GET /top-customers - Top customers by job count
dashboardRoutes.get("/top-customers", async (c) => {
  const limit = parseInt(c.req.query("limit") || "5", 10);

  const topCustomers = await db
    .select({
      name: customers.companyName,
      value: count(),
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .groupBy(customers.companyName)
    .orderBy(sql`count(*) desc`)
    .limit(limit);

  return c.json(topCustomers);
});

export { dashboardRoutes };
