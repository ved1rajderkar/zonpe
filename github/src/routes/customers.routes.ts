import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createCustomerSchema, updateCustomerSchema, customerAddressSchema,
  customerContactSchema, customerNoteSchema, paginationSchema
} from "../lib/validation";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { customers, customerAddresses, customerContacts, customerNotes, jobs, users } from "../db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { createAuditLog, AuditActions } from "../middleware/audit";

const customerRoutes = new Hono();

// Apply auth to all routes
customerRoutes.use("*", authMiddleware());

// GET / - List all customers
customerRoutes.get("/", zValidator("query", paginationSchema), async (c) => {
  const { page, limit, sortBy, sortOrder } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const whereClause = eq(customers.isActive, true);

  const [total] = await db.select({ count: count() }).from(customers).where(whereClause);

  const results = await db
    .select({
      id: customers.id,
      companyName: customers.companyName,
      name: customers.companyName,
      gstNumber: customers.gstNumber,
      panNumber: customers.panNumber,
      website: customers.website,
      industry: customers.industry,
      notes: customers.notes,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(whereClause)
    .orderBy(sortOrder === "desc" ? desc(customers.createdAt) : customers.createdAt)
    .limit(limit)
    .offset(offset);

  return c.json({
    data: results,
    customers: results,
    total: total.count,
    page,
    pageSize: limit,
    totalPages: Math.ceil(Number(total.count) / limit),
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(Number(total.count) / limit),
    },
  });
});

// GET /:id - Get single customer
customerRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();

  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const addresses = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, id));
  const contacts = await db.select().from(customerContacts).where(eq(customerContacts.customerId, id));
  const notes = await db
    .select({
      id: customerNotes.id,
      content: customerNotes.content,
      createdAt: customerNotes.createdAt,
      userName: users.name,
    })
    .from(customerNotes)
    .innerJoin(users, eq(customerNotes.userId, users.id))
    .where(eq(customerNotes.customerId, id))
    .orderBy(desc(customerNotes.createdAt));

  const [jobStats] = await db
    .select({
      total: count(),
    })
    .from(jobs)
    .where(eq(jobs.customerId, id));

  return c.json({
    customer: {
      ...customer,
      addresses,
      contacts,
      notes,
      totalJobs: jobStats.total,
    },
  });
});

// POST / - Create customer
customerRoutes.post("/", zValidator("json", createCustomerSchema.extend({
  address: customerAddressSchema.optional(),
  contact: customerContactSchema.optional(),
})), async (c) => {
  const user = c.get("user");
  const data = c.req.valid("json");

  // Separate customer data from address/contact
  const { address, contact, ...customerData } = data;

  const [customer] = await db
    .insert(customers)
    .values({ ...customerData, isActive: customerData.isActive ?? true })
    .returning();

  // Create address if provided
  if (address) {
    await db.insert(customerAddresses).values({
      customerId: customer.id,
      ...address,
      isPrimary: true,
    });
  }

  // Create contact if provided
  if (contact) {
    await db.insert(customerContacts).values({
      customerId: customer.id,
      ...contact,
      isPrimary: contact.isPrimary ?? true,
      isActive: true,
    });
  }

  await createAuditLog(user.id, {
    action: AuditActions.CUSTOMER_CREATE,
    entityType: "customer",
    entityId: customer.id,
    newValue: customer,
  }, c);

  return c.json({ customer, message: "Customer created" }, 201);
});

// PUT /:id - Update customer
customerRoutes.put("/:id", zValidator("json", updateCustomerSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const [updated] = await db
    .update(customers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();

  await createAuditLog(user.id, {
    action: AuditActions.CUSTOMER_UPDATE,
    entityType: "customer",
    entityId: id,
    oldValue: existing,
    newValue: updated,
  }, c);

  return c.json({ customer: updated, message: "Customer updated" });
});

// DELETE /:id - Soft delete customer
customerRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Customer not found" }, 404);
  }

  await db.update(customers).set({ isActive: false, updatedAt: new Date() }).where(eq(customers.id, id));

  await createAuditLog(user.id, {
    action: AuditActions.CUSTOMER_DELETE,
    entityType: "customer",
    entityId: id,
  }, c);

  return c.json({ message: "Customer deleted" });
});

// GET /:id/addresses - List addresses
customerRoutes.get("/:id/addresses", async (c) => {
  const { id } = c.req.param();
  const addresses = await db.select().from(customerAddresses).where(eq(customerAddresses.customerId, id));
  return c.json(addresses);
});

// POST /:id/addresses - Add address
customerRoutes.post("/:id/addresses", zValidator("json", customerAddressSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [address] = await db
    .insert(customerAddresses)
    .values({ customerId: id, ...data })
    .returning();

  return c.json({ address, message: "Address added" }, 201);
});

// PUT /:id/addresses/:addressId - Update address
customerRoutes.put("/:id/addresses/:addressId", zValidator("json", customerAddressSchema), async (c) => {
  const { addressId } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(customerAddresses)
    .set(data)
    .where(eq(customerAddresses.id, addressId))
    .returning();

  return c.json({ address: updated, message: "Address updated" });
});

// DELETE /:id/addresses/:addressId - Delete address
customerRoutes.delete("/:id/addresses/:addressId", async (c) => {
  const { addressId } = c.req.param();
  await db.delete(customerAddresses).where(eq(customerAddresses.id, addressId));
  return c.json({ message: "Address deleted" });
});

// GET /:id/contacts - List contacts
customerRoutes.get("/:id/contacts", async (c) => {
  const { id } = c.req.param();
  const contacts = await db.select().from(customerContacts).where(eq(customerContacts.customerId, id));
  return c.json(contacts);
});

// POST /:id/contacts - Add contact
customerRoutes.post("/:id/contacts", zValidator("json", customerContactSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [contact] = await db
    .insert(customerContacts)
    .values({ customerId: id, ...data })
    .returning();

  return c.json({ contact, message: "Contact added" }, 201);
});

// PUT /:id/contacts/:contactId - Update contact
customerRoutes.put("/:id/contacts/:contactId", zValidator("json", customerContactSchema), async (c) => {
  const { contactId } = c.req.param();
  const data = c.req.valid("json");

  const [updated] = await db
    .update(customerContacts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(customerContacts.id, contactId))
    .returning();

  return c.json({ contact: updated, message: "Contact updated" });
});

// DELETE /:id/contacts/:contactId - Delete contact
customerRoutes.delete("/:id/contacts/:contactId", async (c) => {
  const { contactId } = c.req.param();
  await db.delete(customerContacts).where(eq(customerContacts.id, contactId));
  return c.json({ message: "Contact deleted" });
});

// GET /:id/notes - List notes
customerRoutes.get("/:id/notes", async (c) => {
  const { id } = c.req.param();
  const notes = await db
    .select({
      id: customerNotes.id,
      content: customerNotes.content,
      createdAt: customerNotes.createdAt,
      userName: users.name,
    })
    .from(customerNotes)
    .innerJoin(users, eq(customerNotes.userId, users.id))
    .where(eq(customerNotes.customerId, id))
    .orderBy(desc(customerNotes.createdAt));
  return c.json(notes);
});

// POST /:id/notes - Add note
customerRoutes.post("/:id/notes", zValidator("json", customerNoteSchema), async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const { content } = c.req.valid("json");

  const [note] = await db
    .insert(customerNotes)
    .values({ customerId: id, userId: user.id, content })
    .returning();

  return c.json({ note, message: "Note added" }, 201);
});

// DELETE /:id/notes/:noteId - Delete note
customerRoutes.delete("/:id/notes/:noteId", async (c) => {
  const { noteId } = c.req.param();
  await db.delete(customerNotes).where(eq(customerNotes.id, noteId));
  return c.json({ message: "Note deleted" });
});

// GET /:id/stats - Customer statistics
customerRoutes.get("/:id/stats", async (c) => {
  const { id } = c.req.param();

  const [totalJobs] = await db.select({ count: count() }).from(jobs).where(eq(jobs.customerId, id));

  const statusCounts = await db
    .select({
      status: jobs.status,
      count: count(),
    })
    .from(jobs)
    .where(eq(jobs.customerId, id))
    .groupBy(jobs.status);

  const priorityCounts = await db
    .select({
      priority: jobs.priority,
      count: count(),
    })
    .from(jobs)
    .where(eq(jobs.customerId, id))
    .groupBy(jobs.priority);

  return c.json({
    stats: {
      totalJobs: totalJobs.count,
      byStatus: statusCounts,
      byPriority: priorityCounts,
    },
  });
});

export { customerRoutes };
