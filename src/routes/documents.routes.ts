import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { uploadFile, deleteFile } from "../lib/storage";
import { createAuditLog, AuditActions } from "../middleware/audit";

const documentRoutes = new Hono();

documentRoutes.use("*", authMiddleware());

// GET / - List documents
documentRoutes.get("/", zValidator("query", z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  category: z.string().optional(),
})), async (c) => {
  const { entityType, entityId, category } = c.req.valid("query");

  const conditions = [];
  if (entityType) conditions.push(eq(documents.entityType, entityType as any));
  if (entityId) conditions.push(eq(documents.entityId, entityId));
  if (category) conditions.push(eq(documents.category, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(documents)
    .where(whereClause)
    .orderBy(documents.createdAt);

  return c.json({ documents: results });
});

// GET /categories - Get document categories
documentRoutes.get("/categories", async (c) => {
  return c.json({
    categories: [
      "contract", "drawing", "certificate", "invoice",
      "report", "photo", "specification", "other"
    ],
  });
});

// GET /:id - Get single document
documentRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }
  return c.json({ document: doc });
});

// PUT /:id - Update document
documentRoutes.put("/:id", zValidator("json", z.object({
  fileName: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
})), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  const [existing] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!existing) {
    return c.json({ error: "Document not found" }, 404);
  }

  const [updated] = await db
    .update(documents)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(documents.id, id))
    .returning();

  return c.json({ document: updated, message: "Document updated" });
});

// POST / - Upload document
documentRoutes.post("/", async (c) => {
  const user = c.get("user");

  const body = await c.req.parseBody();
  const file = body["file"] as File;
  const entityType = body["entityType"] as string;
  const entityId = body["entityId"] as string;
  const category = body["category"] as string;

  if (!file || !entityType || !entityId) {
    return c.json({ error: "File, entityType, and entityId are required" }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadFile(buffer, file.name, {
      folder: `jobtrack/${entityType}/${entityId}`,
    });

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: entityType as any,
        entityId,
        fileName: file.name,
        fileUrl: result.url,
        fileType: file.type,
        fileSize: file.size,
        category: category || "other",
        uploadedBy: user.id,
      })
      .returning();

    await createAuditLog(user.id, {
      action: AuditActions.DOCUMENT_UPLOAD,
      entityType: "document",
      entityId: doc.id,
      newValue: doc,
    }, c);

    return c.json({ document: doc, message: "Document uploaded" }, 201);
  } catch (error: any) {
    return c.json({ error: error.message || "Upload failed" }, 500);
  }
});

// DELETE /:id - Delete document
documentRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  // Delete from storage
  const urlParts = doc.fileUrl.split("/");
  const publicId = urlParts.slice(-2).join("/").split(".")[0];
  await deleteFile(publicId);

  await db.delete(documents).where(eq(documents.id, id));

  await createAuditLog(user.id, {
    action: AuditActions.DOCUMENT_DELETE,
    entityType: "document",
    entityId: id,
    oldValue: doc,
  }, c);

  return c.json({ message: "Document deleted" });
});

// GET /:id/download - Get download URL
documentRoutes.get("/:id/download", async (c) => {
  const { id } = c.req.param();

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) {
    return c.json({ error: "Document not found" }, 404);
  }

  return c.json({ url: doc.fileUrl, fileName: doc.fileName });
});

export { documentRoutes };
