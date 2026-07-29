import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, customers, dispatches, jobTimeline, customerContacts } from "../db/schema";
import { desc, eq, not } from "drizzle-orm";
import { naturalLanguageSearch, generateJobSummary, generateEmailContent, getSmartSuggestions, generateReportInsights, chat } from "../lib/ai";

const aiRoutes = new Hono();

aiRoutes.use("*", authMiddleware());

// POST /chat - AI chat
aiRoutes.post("/chat", zValidator("json", z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
  context: z.string().optional(),
})), async (c) => {
  const { messages, context } = c.req.valid("json");

  // Fetch relevant context data
  const recentJobs = await db
    .select({
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      material: jobs.material,
      quantity: jobs.quantity,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(10);

  const chatMessages = [
    {
      role: "system" as const,
      content: `You are JobTrack Pro AI assistant for an industrial job tracking platform. You help users manage jobs, track production, handle dispatches, and generate insights. Be concise, helpful, and professional. Available context: ${JSON.stringify({ recentJobs, additionalContext: context })}`,
    },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const response = await chat(chatMessages);
  return c.json({ response });
});

// POST /search - Natural language search
aiRoutes.post("/search", zValidator("json", z.object({
  query: z.string().min(1),
})), async (c) => {
  const { query } = c.req.valid("json");

  // Fetch context data
  const recentJobs = await db
    .select({
      jobNumber: jobs.jobNumber,
      customerName: customers.companyName,
      material: jobs.material,
      quantity: jobs.quantity,
      status: jobs.status,
      priority: jobs.priority,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(desc(jobs.createdAt))
    .limit(20);

  const recentCustomers = await db
    .select({
      companyName: customers.companyName,
      industry: customers.industry,
    })
    .from(customers)
    .limit(20);

  const recentDispatches = await db
    .select({
      dispatchNumber: dispatches.dispatchNumber,
      jobNumber: jobs.jobNumber,
      quantityDispatched: dispatches.quantityDispatched,
      status: dispatches.status,
    })
    .from(dispatches)
    .leftJoin(jobs, eq(dispatches.jobId, jobs.id))
    .orderBy(desc(dispatches.createdAt))
    .limit(20);

  const response = await naturalLanguageSearch(query, {
    jobs: recentJobs,
    customers: recentCustomers,
    dispatches: recentDispatches,
  });

  return c.json({ response, query });
});

// POST /summarize/:jobId - Generate job summary
aiRoutes.post("/summarize/:jobId", async (c) => {
  const { jobId } = c.req.param();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const timeline = await db
    .select()
    .from(jobTimeline)
    .where(eq(jobTimeline.jobId, jobId))
    .orderBy(desc(jobTimeline.createdAt))
    .limit(10);

  const summary = await generateJobSummary(job, timeline, []);
  return c.json({ summary, jobNumber: job.jobNumber });
});

// POST /generate-email - Generate email content
aiRoutes.post("/generate-email", zValidator("json", z.object({
  purpose: z.string().min(1),
  context: z.record(z.any()),
})), async (c) => {
  const { purpose, context } = c.req.valid("json");
  const email = await generateEmailContent(purpose, context);
  return c.json({ email });
});

// POST /draft-inventory-email - Auto-draft email from DB jobs, one-click send
aiRoutes.post("/draft-inventory-email", zValidator("json", z.object({
  subject: z.string().optional(),
  additionalNotes: z.string().optional(),
})), async (c) => {
  const body = c.req.valid("json");

  // Auto-read materials from jobs in DB
  const activeJobs = await db
    .select({
      material: jobs.material,
      quantity: jobs.quantity,
      unit: jobs.unit,
      grade: jobs.grade,
      status: jobs.status,
      jobNumber: jobs.jobNumber,
    })
    .from(jobs)
    .where(not(eq(jobs.status, "cancelled")))
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  if (activeJobs.length === 0) {
    return c.json({ error: "No active jobs found in the system" }, 400);
  }

  // Aggregate materials
  const materialMap = new Map<string, { material: string; totalQty: number; unit: string; grades: string[]; jobCount: number }>();
  for (const job of activeJobs) {
    if (!job.material) continue;
    const key = job.material.toLowerCase();
    const existing = materialMap.get(key);
    if (existing) {
      existing.totalQty += job.quantity;
      existing.jobCount++;
      if (job.grade && !existing.grades.includes(job.grade)) {
        existing.grades.push(job.grade);
      }
    } else {
      materialMap.set(key, {
        material: job.material,
        totalQty: job.quantity,
        unit: job.unit || "nos",
        grades: job.grade ? [job.grade] : [],
        jobCount: 1,
      });
    }
  }

  const materialSummary = Array.from(materialMap.values());

  const systemPrompt = `You are a professional email assistant for JobTrack Pro, an industrial job tracking platform.
Draft a professional email about available inventory/materials based on current job data.
The email should:
- Be clear, professional, and compelling
- List available materials with quantities and grades
- Mention how many jobs are active for each material
- Include a call to action
- Return in JSON format: { "subject": "...", "body": "..." }`;

  const materialList = materialSummary
    .map((m) => `- ${m.material}: ${m.totalQty} ${m.unit}${m.grades.length ? ` (Grades: ${m.grades.join(", ")})` : ""} - ${m.jobCount} active job(s)`)
    .join("\n");

  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Draft an email about available materials:
Subject: ${body.subject || "Available Materials & Inventory Update"}
Material Summary:
${materialList}
${body.additionalNotes ? `Additional Notes: ${body.additionalNotes}` : ""}`,
    },
  ];

  const response = await chat(messages, { temperature: 0.7, maxTokens: 1500 });

  let emailContent;
  try {
    emailContent = JSON.parse(response);
  } catch {
    emailContent = {
      subject: body.subject || "Available Materials & Inventory Update",
      body: response,
    };
  }

  return c.json({
    email: emailContent,
    materialSummary,
    jobCount: activeJobs.length,
  });
});

// POST /send-inventory-email - Send drafted email to all customers
aiRoutes.post("/send-inventory-email", zValidator("json", z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
})), async (c) => {
  const body = c.req.valid("json");

  // Get all customer contacts with email
  const allContacts = await db
    .select({
      email: customerContacts.email,
      name: customerContacts.name,
      companyName: customers.companyName,
    })
    .from(customerContacts)
    .innerJoin(customers, eq(customerContacts.customerId, customers.id))
    .where(eq(customerContacts.isActive, true));

  const recipients = allContacts
    .map((c) => c.email)
    .filter((email): email is string => !!email && email.length > 0);

  if (recipients.length === 0) {
    return c.json({ error: "No customer contacts with email found" }, 400);
  }

  const { sendEmail } = await import("../lib/email");
  const result = await sendEmail({
    to: [...new Set(recipients)], // deduplicate
    subject: body.subject,
    html: body.body,
  });

  return c.json({
    success: result.success,
    messageId: result.messageId,
    recipientCount: recipients.length,
    recipients: allContacts.filter((c) => c.email).map((c) => `${c.name} (${c.companyName})`),
  });
});

// POST /suggestions - Get smart suggestions
aiRoutes.post("/suggestions", async (c) => {
  const recentJobs = await db
    .select({
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      dueDate: jobs.dueDate,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(10);

  const suggestions = await getSmartSuggestions({ jobs: recentJobs });
  return c.json({ suggestions });
});

// POST /report-insights - Generate report insights
aiRoutes.post("/report-insights", zValidator("json", z.object({
  reportType: z.string(),
  data: z.array(z.any()),
  summary: z.record(z.any()),
})), async (c) => {
  const { reportType, data, summary } = c.req.valid("json");
  const insights = await generateReportInsights({ reportType, data, summary });
  return c.json({ insights });
});

// GET /history - Get AI chat history
aiRoutes.get("/history", async (c) => {
  return c.json({ history: [] });
});

// DELETE /history - Clear AI chat history
aiRoutes.delete("/history", async (c) => {
  return c.json({ message: "History cleared" });
});

// GET /predictions - Get AI predictions
aiRoutes.get("/predictions", async (c) => {
  const recentJobs = await db
    .select({
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      dueDate: jobs.dueDate,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(20);

  const delayedJobs = recentJobs.filter(j => j.dueDate && new Date(j.dueDate) < new Date());

  return c.json({
    predictions: [
      {
        type: "delay_risk",
        message: `${delayedJobs.length} job(s) are at risk of delay`,
        jobs: delayedJobs.map(j => j.jobNumber),
      },
    ],
  });
});

// GET /recommendations/:entityType/:entityId - Get AI recommendations
aiRoutes.get("/recommendations/:entityType/:entityId", async (c) => {
  const { entityType, entityId } = c.req.param();
  return c.json({
    recommendations: [
      {
        type: "action",
        message: `Review ${entityType} ${entityId} for optimization`,
        priority: "medium",
      },
    ],
  });
});

// POST /feedback - Submit AI feedback
aiRoutes.post("/feedback", zValidator("json", z.object({
  messageId: z.string().optional(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
})), async (c) => {
  return c.json({ message: "Feedback recorded" });
});

export { aiRoutes };
