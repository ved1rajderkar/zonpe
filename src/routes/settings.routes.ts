import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { updateSettingSchema, createAutomationRuleSchema, updateAutomationRuleSchema, createTemplateSchema, updateTemplateSchema } from "../lib/validation";
import { authMiddleware, adminOnly } from "../middleware/auth";
import { db } from "../db";
import { settings, automationRules, notificationTemplates, roles, users } from "../db/schema";
import { eq, count } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { initializeDefaultRules } from "../lib/automation";
import { createAuditLog, AuditActions } from "../middleware/audit";

const settingsRoutes = new Hono();

settingsRoutes.use("*", authMiddleware());

// GET /company - Get company settings
settingsRoutes.get("/company", async (c) => {
  const results = await db.select().from(settings).where(eq(settings.category, "company"));
  const companySettings: Record<string, any> = {};
  for (const s of results) {
    companySettings[s.key] = s.value;
  }
  return c.json({ settings: companySettings });
});

// PUT /company - Update company settings (admin only)
settingsRoutes.put("/company", adminOnly(), zValidator("json", z.record(z.any())), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  for (const [key, value] of Object.entries(data)) {
    const [existing] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (existing) {
      await db.update(settings).set({ value, updatedBy: user.id, updatedAt: new Date() }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value, category: "company", updatedBy: user.id });
    }
  }

  await createAuditLog(user.id, { action: AuditActions.SETTINGS_UPDATE, entityType: "settings", newValue: data }, c);

  return c.json({ message: "Settings updated" });
});

// GET /automation - List automation rules
settingsRoutes.get("/automation", async (c) => {
  const results = await db.select().from(automationRules);
  return c.json({ rules: results });
});

// POST /automation - Create automation rule (admin only)
settingsRoutes.post("/automation", adminOnly(), zValidator("json", createAutomationRuleSchema), async (c) => {
  const data = c.req.valid("json");

  const [rule] = await db
    .insert(automationRules)
    .values({
      ...data,
      isActive: data.isActive ?? true,
    })
    .returning();

  return c.json({ rule, message: "Rule created" }, 201);
});

// PUT /automation/:id - Update rule (admin only)
settingsRoutes.put("/automation/:id", adminOnly(), zValidator("json", updateAutomationRuleSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(automationRules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(automationRules.id, id))
    .returning();

  return c.json({ rule: updated, message: "Rule updated" });
});

// DELETE /automation/:id - Delete rule (admin only)
settingsRoutes.delete("/automation/:id", adminOnly(), async (c) => {
  const { id } = c.req.param();
  await db.delete(automationRules).where(eq(automationRules.id, id));
  return c.json({ message: "Rule deleted" });
});

// POST /automation/init - Initialize default rules (admin only)
settingsRoutes.post("/automation/init", adminOnly(), async (c) => {
  await initializeDefaultRules();
  return c.json({ message: "Default rules initialized" });
});

// GET /templates - List notification templates
settingsRoutes.get("/templates", async (c) => {
  const results = await db.select().from(notificationTemplates);
  return c.json({ templates: results });
});

// POST /templates - Create template (admin only)
settingsRoutes.post("/templates", adminOnly(), zValidator("json", createTemplateSchema), async (c) => {
  const data = c.req.valid("json");

  const [template] = await db
    .insert(notificationTemplates)
    .values({
      ...data,
      isActive: data.isActive ?? true,
    })
    .returning();

  return c.json({ template, message: "Template created" }, 201);
});

// PUT /templates/:id - Update template (admin only)
settingsRoutes.put("/templates/:id", adminOnly(), zValidator("json", updateTemplateSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(notificationTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(notificationTemplates.id, id))
    .returning();

  return c.json({ template: updated, message: "Template updated" });
});

// DELETE /templates/:id - Delete template (admin only)
settingsRoutes.delete("/templates/:id", adminOnly(), async (c) => {
  const { id } = c.req.param();
  await db.delete(notificationTemplates).where(eq(notificationTemplates.id, id));
  return c.json({ message: "Template deleted" });
});

// GET /users - List users (admin only)
settingsRoutes.get("/users", adminOnly(), async (c) => {
  const results = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users);

  return c.json({ users: results });
});

// POST /users - Create user (admin only)
settingsRoutes.post("/users", adminOnly(), zValidator("json", z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(["admin", "production", "quality", "dispatch", "customer"]),
})), async (c) => {
  const data = c.req.valid("json");

  const [existing] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) {
    return c.json({ error: "Email already exists" }, 409);
  }

  const passwordHash = await hashPassword(data.password);
  const [user] = await db
    .insert(users)
    .values({
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
    })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  return c.json({ user, message: "User created" }, 201);
});

// PUT /users/:id - Update user (admin only)
settingsRoutes.put("/users/:id", adminOnly(), zValidator("json", z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["admin", "production", "quality", "dispatch", "customer"]).optional(),
  isActive: z.boolean().optional(),
})), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive });

  return c.json({ user: updated, message: "User updated" });
});

// PUT /users/:id/reset-password - Reset user password (admin only)
settingsRoutes.put("/users/:id/reset-password", adminOnly(), zValidator("json", z.object({
  password: z.string().min(8),
})), async (c) => {
  const { id } = c.req.param();
  const { password } = c.req.valid("json");

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));

  return c.json({ message: "Password reset" });
});

// GET /roles - List roles
settingsRoutes.get("/roles", async (c) => {
  const results = await db.select().from(roles);
  return c.json({ roles: results });
});

// POST /roles - Create role (admin only)
settingsRoutes.post("/roles", adminOnly(), zValidator("json", z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()),
})), async (c) => {
  const data = c.req.valid("json");

  const [role] = await db
    .insert(roles)
    .values({
      ...data,
      isSystem: false,
    })
    .returning();

  return c.json({ role, message: "Role created" }, 201);
});

// PUT /roles/:id - Update role (admin only)
settingsRoutes.put("/roles/:id", adminOnly(), zValidator("json", z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
})), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(roles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(roles.id, id))
    .returning();

  return c.json({ role: updated, message: "Role updated" });
});

export { settingsRoutes };
