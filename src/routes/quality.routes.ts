import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createQualityCheckSchema, updateQualityCheckSchema, qualityParameterSchema } from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { qualityChecks, qualityParameters, jobs, users } from "../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";
import { emitEvent } from "../lib/automation";

const qualityRoutes = new Hono();

qualityRoutes.use("*", authMiddleware());

// GET / - List quality checks
qualityRoutes.get("/", zValidator("query", z.object({
  jobId: z.string().uuid().optional(),
  status: z.string().optional(),
})), async (c) => {
  const { jobId, status } = c.req.valid("query");

  const conditions = [];
  if (jobId) conditions.push(eq(qualityChecks.jobId, jobId));
  if (status) conditions.push(eq(qualityChecks.status, status as any));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: qualityChecks.id,
      jobId: qualityChecks.jobId,
      jobNumber: jobs.jobNumber,
      checkType: qualityChecks.checkType,
      status: qualityChecks.status,
      inspectorId: qualityChecks.inspectorId,
      inspectorName: users.name,
      checkedAt: qualityChecks.checkedAt,
      notes: qualityChecks.notes,
      defectsFound: qualityChecks.defectsFound,
      defectDescription: qualityChecks.defectDescription,
      createdAt: qualityChecks.createdAt,
    })
    .from(qualityChecks)
    .leftJoin(jobs, eq(qualityChecks.jobId, jobs.id))
    .leftJoin(users, eq(qualityChecks.inspectorId, users.id))
    .where(whereClause)
    .orderBy(desc(qualityChecks.createdAt));

  return c.json({ checks: results });
});

// GET /stats - Quality statistics
qualityRoutes.get("/stats", async (c) => {
  const [total] = await db.select({ count: count() }).from(qualityChecks);

  const statusCounts = await db
    .select({ status: qualityChecks.status, count: count() })
    .from(qualityChecks)
    .groupBy(qualityChecks.status);

  const [totalDefects] = await db
    .select({ total: sql`coalesce(sum(${qualityChecks.defectsFound}), 0)`.as("total") })
    .from(qualityChecks);

  const passRate = total.count > 0
    ? ((statusCounts.find(s => s.status === "passed")?.count || 0) / Number(total.count) * 100).toFixed(1)
    : "0";

  return c.json({
    stats: {
      total: total.count,
      byStatus: statusCounts,
      totalDefects: totalDefects.total,
      passRate: `${passRate}%`,
    },
  });
});

// GET /:id - Get single quality check
qualityRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const [check] = await db
    .select({
      id: qualityChecks.id,
      jobId: qualityChecks.jobId,
      jobNumber: jobs.jobNumber,
      checkType: qualityChecks.checkType,
      status: qualityChecks.status,
      inspectorId: qualityChecks.inspectorId,
      inspectorName: users.name,
      checkedAt: qualityChecks.checkedAt,
      notes: qualityChecks.notes,
      defectsFound: qualityChecks.defectsFound,
      defectDescription: qualityChecks.defectDescription,
      createdAt: qualityChecks.createdAt,
    })
    .from(qualityChecks)
    .leftJoin(jobs, eq(qualityChecks.jobId, jobs.id))
    .leftJoin(users, eq(qualityChecks.inspectorId, users.id))
    .where(eq(qualityChecks.id, id))
    .limit(1);

  if (!check) {
    return c.json({ error: "Quality check not found" }, 404);
  }

  const parameters = await db
    .select()
    .from(qualityParameters)
    .where(eq(qualityParameters.qualityCheckId, id));

  return c.json({ check: { ...check, parameters } });
});

// POST / - Create quality check
qualityRoutes.post("/", zValidator("json", createQualityCheckSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  const [check] = await db
    .insert(qualityChecks)
    .values({
      jobId: data.jobId,
      checkType: data.checkType,
      inspectorId: user.id,
      notes: data.notes,
    })
    .returning();

  await emitEvent("quality.check_created", {
    entityType: "quality_check",
    entityId: check.id,
    data: {
      jobId: data.jobId,
      checkType: data.checkType,
      inspector: user.name,
    },
    userId: user.id,
  });

  return c.json({ check, message: "Quality check created" }, 201);
});

// PUT /:id - Update quality check
qualityRoutes.put("/:id", zValidator("json", updateQualityCheckSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [existing] = await db.select().from(qualityChecks).where(eq(qualityChecks.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Quality check not found" }, 404);
  }

  const updateData: any = { ...data, updatedAt: new Date() };
  if (data.status === "passed" || data.status === "failed" || data.status === "rework") {
    updateData.checkedAt = new Date();
    updateData.inspectorId = user.id;
  }

  const [updated] = await db
    .update(qualityChecks)
    .set(updateData)
    .where(eq(qualityChecks.id, id))
    .returning();

  // Trigger events based on status change
  if (data.status && data.status !== existing.status) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, existing.jobId)).limit(1);

    if (data.status === "failed") {
      await emitEvent("quality.check_failed", {
        entityType: "quality_check",
        entityId: id,
        data: {
          jobId: existing.jobId,
          jobNumber: job?.jobNumber,
          checkType: existing.checkType,
          defectsFound: data.defectsFound || 0,
          defectDescription: data.defectDescription,
        },
        userId: user.id,
      });
    } else if (data.status === "passed") {
      await emitEvent("quality.check_passed", {
        entityType: "quality_check",
        entityId: id,
        data: {
          jobId: existing.jobId,
          jobNumber: job?.jobNumber,
          checkType: existing.checkType,
        },
        userId: user.id,
      });

      // Check if all quality checks passed for the job
      const [stats] = await db
        .select({
          total: count(),
          passed: sql`count(*) filter (where ${qualityChecks.status} = 'passed')`.as("passed"),
        })
        .from(qualityChecks)
        .where(eq(qualityChecks.jobId, existing.jobId));

      if (stats.total === stats.passed) {
        await db
          .update(jobs)
          .set({ status: "ready_for_dispatch", updatedAt: new Date() })
          .where(eq(jobs.id, existing.jobId));
      }
    } else if (data.status === "rework") {
      await emitEvent("quality.rework_required", {
        entityType: "quality_check",
        entityId: id,
        data: {
          jobId: existing.jobId,
          jobNumber: job?.jobNumber,
          checkType: existing.checkType,
        },
        userId: user.id,
      });
    }
  }

  return c.json({ check: updated, message: "Quality check updated" });
});

// DELETE /:id - Delete quality check
qualityRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  await db.delete(qualityChecks).where(eq(qualityChecks.id, id));
  return c.json({ message: "Quality check deleted" });
});

// POST /:id/parameters - Add parameter
qualityRoutes.post("/:id/parameters", zValidator("json", qualityParameterSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [parameter] = await db
    .insert(qualityParameters)
    .values({ qualityCheckId: id, ...data })
    .returning();

  return c.json({ parameter, message: "Parameter added" }, 201);
});

// DELETE /:id/parameters/:paramId - Delete parameter
qualityRoutes.delete("/:id/parameters/:paramId", async (c) => {
  const { paramId } = c.req.param();
  await db.delete(qualityParameters).where(eq(qualityParameters.id, paramId));
  return c.json({ message: "Parameter deleted" });
});

export { qualityRoutes };
