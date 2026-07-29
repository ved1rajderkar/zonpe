import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createProductionStepSchema, updateProductionStepSchema,
  assignWorkerSchema, startStepSchema, completeStepSchema
} from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { productionSteps, productionAssignments, jobs, users, customers } from "../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";
import { emitEvent } from "../lib/automation";

const productionRoutes = new Hono();

productionRoutes.use("*", authMiddleware());

// GET /steps - List all production steps for a job
productionRoutes.get("/steps", zValidator("query", z.object({
  jobId: z.string().uuid().optional(),
})), async (c) => {
  const { jobId } = c.req.valid("query");

  const whereClause = jobId ? eq(productionSteps.jobId, jobId) : undefined;

  const results = await db
    .select({
      id: productionSteps.id,
      jobId: productionSteps.jobId,
      jobNumber: jobs.jobNumber,
      stepName: productionSteps.stepName,
      stepOrder: productionSteps.stepOrder,
      status: productionSteps.status,
      startedBy: productionSteps.startedBy,
      completedBy: productionSteps.completedBy,
      startedAt: productionSteps.startedAt,
      completedAt: productionSteps.completedAt,
      estimatedHours: productionSteps.estimatedHours,
      actualHours: productionSteps.actualHours,
      remarks: productionSteps.remarks,
      createdAt: productionSteps.createdAt,
    })
    .from(productionSteps)
    .leftJoin(jobs, eq(productionSteps.jobId, jobs.id))
    .where(whereClause)
    .orderBy(productionSteps.stepOrder);

  return c.json({ steps: results });
});

// GET /steps/:id - Get single step
productionRoutes.get("/steps/:id", async (c) => {
  const { id } = c.req.param();

  const [step] = await db
    .select({
      id: productionSteps.id,
      jobId: productionSteps.jobId,
      jobNumber: jobs.jobNumber,
      stepName: productionSteps.stepName,
      stepOrder: productionSteps.stepOrder,
      status: productionSteps.status,
      startedBy: productionSteps.startedBy,
      completedBy: productionSteps.completedBy,
      startedAt: productionSteps.startedAt,
      completedAt: productionSteps.completedAt,
      estimatedHours: productionSteps.estimatedHours,
      actualHours: productionSteps.actualHours,
      remarks: productionSteps.remarks,
      createdAt: productionSteps.createdAt,
    })
    .from(productionSteps)
    .leftJoin(jobs, eq(productionSteps.jobId, jobs.id))
    .where(eq(productionSteps.id, id))
    .limit(1);

  if (!step) {
    return c.json({ error: "Step not found" }, 404);
  }

  const assignments = await db
    .select({
      id: productionAssignments.id,
      userId: productionAssignments.userId,
      userName: users.name,
      assignedAt: productionAssignments.assignedAt,
      completedAt: productionAssignments.completedAt,
    })
    .from(productionAssignments)
    .innerJoin(users, eq(productionAssignments.userId, users.id))
    .where(eq(productionAssignments.productionStepId, id));

  return c.json({ step: { ...step, assignments } });
});

// POST /steps - Create production step
productionRoutes.post("/steps", zValidator("json", createProductionStepSchema), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Get next step order
  const [lastStep] = await db
    .select({ stepOrder: productionSteps.stepOrder })
    .from(productionSteps)
    .where(eq(productionSteps.jobId, data.jobId))
    .orderBy(productionSteps.stepOrder)
    .limit(1);

  const stepOrder = data.stepOrder ?? ((lastStep?.stepOrder || 0) + 1);

  const [step] = await db
    .insert(productionSteps)
    .values({
      jobId: data.jobId,
      stepName: data.stepName,
      stepOrder,
      estimatedHours: data.estimatedHours,
      remarks: data.remarks,
    })
    .returning();

  return c.json({ step, message: "Step created" }, 201);
});

// PUT /steps/:id - Update step
productionRoutes.put("/steps/:id", zValidator("json", updateProductionStepSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(productionSteps)
    .set(data)
    .where(eq(productionSteps.id, id))
    .returning();

  return c.json({ step: updated, message: "Step updated" });
});

// DELETE /steps/:id - Delete step
productionRoutes.delete("/steps/:id", async (c) => {
  const { id } = c.req.param();
  await db.delete(productionSteps).where(eq(productionSteps.id, id));
  return c.json({ message: "Step deleted" });
});

// POST /steps/:id/start - Start a step
productionRoutes.post("/steps/:id/start", zValidator("json", startStepSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { remarks } = c.req.valid("json");

  const [step] = await db.select().from(productionSteps).where(eq(productionSteps.id, id)).limit(1);
  if (!step) {
    return c.json({ error: "Step not found" }, 404);
  }

  if (step.status !== "pending") {
    return c.json({ error: "Step cannot be started" }, 400);
  }

  const [updated] = await db
    .update(productionSteps)
    .set({
      status: "in_progress",
      startedBy: user.id,
      startedAt: new Date(),
      remarks: remarks || step.remarks,
    })
    .where(eq(productionSteps.id, id))
    .returning();

  // Update job status to in_production
  await db
    .update(jobs)
    .set({ status: "in_production", updatedAt: new Date() })
    .where(eq(jobs.id, step.jobId));

  await emitEvent("production.step_started", {
    entityType: "production_step",
    entityId: id,
    data: {
      jobId: step.jobId,
      stepName: step.stepName,
      startedBy: user.name,
    },
    userId: user.id,
  });

  return c.json({ step: updated, message: "Step started" });
});

// POST /steps/:id/complete - Complete a step
productionRoutes.post("/steps/:id/complete", zValidator("json", completeStepSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { actualHours, remarks } = c.req.valid("json");

  const [step] = await db.select().from(productionSteps).where(eq(productionSteps.id, id)).limit(1);
  if (!step) {
    return c.json({ error: "Step not found" }, 404);
  }

  if (step.status !== "in_progress") {
    return c.json({ error: "Step is not in progress" }, 400);
  }

  const [updated] = await db
    .update(productionSteps)
    .set({
      status: "completed",
      completedBy: user.id,
      completedAt: new Date(),
      actualHours: actualHours || undefined,
      remarks: remarks || step.remarks,
    })
    .where(eq(productionSteps.id, id))
    .returning();

  // Check if all steps are completed
  const [stats] = await db
    .select({
      total: count(),
      completed: sql`count(*) filter (where ${productionSteps.status} = 'completed')`.as("completed"),
    })
    .from(productionSteps)
    .where(eq(productionSteps.jobId, step.jobId));

  // If all steps completed, update job status
  if (stats.total === stats.completed) {
    await db
      .update(jobs)
      .set({ status: "quality_check", updatedAt: new Date() })
      .where(eq(jobs.id, step.jobId));
  }

  await emitEvent("production.step_completed", {
    entityType: "production_step",
    entityId: id,
    data: {
      jobId: step.jobId,
      stepName: step.stepName,
      completedBy: user.name,
      actualHours,
    },
    userId: user.id,
  });

  return c.json({ step: updated, message: "Step completed" });
});

// POST /steps/:id/assign - Assign worker
productionRoutes.post("/steps/:id/assign", zValidator("json", assignWorkerSchema), async (c) => {
  const { id } = c.req.param();
  const { userId } = c.req.valid("json");

  // Check if already assigned
  const [existing] = await db
    .select()
    .from(productionAssignments)
    .where(
      and(
        eq(productionAssignments.productionStepId, id),
        eq(productionAssignments.userId, userId)
      )
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "Worker already assigned" }, 409);
  }

  const [assignment] = await db
    .insert(productionAssignments)
    .values({ productionStepId: id, userId })
    .returning();

  return c.json({ assignment, message: "Worker assigned" }, 201);
});

// DELETE /steps/:id/assign/:userId - Unassign worker
productionRoutes.delete("/steps/:id/assign/:userId", async (c) => {
  const { id, userId } = c.req.param();

  await db
    .delete(productionAssignments)
    .where(
      and(
        eq(productionAssignments.productionStepId, id),
        eq(productionAssignments.userId, userId)
      )
    );

  return c.json({ message: "Worker unassigned" });
});

// GET /my-tasks - Get tasks assigned to current user
productionRoutes.get("/my-tasks", async (c) => {
  const user = c.get("user");

  const myAssignments = await db
    .select({
      assignmentId: productionAssignments.id,
      assignedAt: productionAssignments.assignedAt,
      stepId: productionSteps.id,
      stepName: productionSteps.stepName,
      status: productionSteps.status,
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
    })
    .from(productionAssignments)
    .innerJoin(productionSteps, eq(productionAssignments.productionStepId, productionSteps.id))
    .innerJoin(jobs, eq(productionSteps.jobId, jobs.id))
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(productionAssignments.userId, user.id))
    .orderBy(productionSteps.stepOrder);

  return c.json({ tasks: myAssignments });
});

export { productionRoutes };
