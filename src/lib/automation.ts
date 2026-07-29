import { db } from "../db";
import { automationRules, automationLogs, jobs, jobTimeline, notifications } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification, notifyCustomerContacts } from "./notifications";
import { sendTemplateEmail } from "./email";
import { env } from "./env";

// Event types
export type AutomationEventType =
  | "job.created"
  | "job.status_changed"
  | "job.updated"
  | "job.due_soon"
  | "job.overdue"
  | "job.completed"
  | "production.step_started"
  | "production.step_completed"
  | "quality.check_created"
  | "quality.check_passed"
  | "quality.check_failed"
  | "quality.rework_required"
  | "dispatch.created"
  | "dispatch.status_changed"
  | "dispatch.delivered"
  | "customer.created"
  | "customer.updated";

export interface AutomationEvent {
  type: AutomationEventType;
  entityType: string;
  entityId: string;
  data: Record<string, any>;
  userId?: string;
}

// Event bus for in-memory event handling
type EventHandler = (event: AutomationEvent) => Promise<void>;
const eventHandlers: Map<string, EventHandler[]> = new Map();

export function onAutomationEvent(eventType: string, handler: EventHandler) {
  const handlers = eventHandlers.get(eventType) || [];
  handlers.push(handler);
  eventHandlers.set(eventType, handlers);
}

// Process automation rules for an event
export async function processAutomationEvent(event: AutomationEvent): Promise<void> {
  console.log(`⚡ Processing automation event: ${event.type}`);

  // Execute built-in handlers
  const handlers = eventHandlers.get(event.type) || [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error(`Error in event handler for ${event.type}:`, error);
    }
  }

  // Execute configured automation rules
  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.eventType, event.type),
        eq(automationRules.isActive, true)
      )
    );

  for (const rule of rules) {
    await executeAutomationRule(rule, event);
  }
}

// Execute a single automation rule
async function executeAutomationRule(rule: any, event: AutomationEvent): Promise<void> {
  try {
    // Check conditions
    if (rule.conditions && !evaluateConditions(rule.conditions, event.data)) {
      await logAutomationExecution(rule.id, event, "skipped", "Conditions not met");
      return;
    }

    // Execute actions
    for (const action of rule.actions || []) {
      await executeAction(action, event);
    }

    await logAutomationExecution(rule.id, event, "success");
  } catch (error: any) {
    console.error(`Automation rule ${rule.name} failed:`, error);
    await logAutomationExecution(rule.id, event, "failed", error.message);
  }
}

// Evaluate conditions
function evaluateConditions(conditions: any, data: Record<string, any>): boolean {
  if (!conditions) return true;

  // Simple condition evaluation
  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = data[key];
    if (actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
}

// Execute an action
async function executeAction(action: { type: string; config: any }, event: AutomationEvent): Promise<void> {
  switch (action.type) {
    case "email":
      await executeEmailAction(action.config, event);
      break;
    case "notification":
      await executeNotificationAction(action.config, event);
      break;
    case "timeline":
      await executeTimelineAction(action.config, event);
      break;
    case "update_status":
      await executeStatusUpdateAction(action.config, event);
      break;
    default:
      console.warn(`Unknown automation action type: ${action.type}`);
  }
}

// Email action
async function executeEmailAction(config: any, event: AutomationEvent): Promise<void> {
  const { template, recipientType, recipients } = config;

  let emailRecipients: string[] = [];

  if (recipientType === "fixed" && recipients) {
    emailRecipients = recipients;
  } else if (recipientType === "customer_contacts") {
    const job = await db.select().from(jobs).where(eq(jobs.id, event.entityId)).limit(1);
    if (job.length > 0) {
      const customerNotify = await notifyCustomerContacts(job[0].customerId, template, event.data);
      console.log(`📧 Customer emails: ${customerNotify.sent} sent, ${customerNotify.failed} failed`);
      return;
    }
  }

  for (const recipient of emailRecipients) {
    await sendTemplateEmail(template, recipient, event.data);
  }
}

// Notification action
async function executeNotificationAction(config: any, event: AutomationEvent): Promise<void> {
  const { subject, body, userId } = config;
  const variables = { ...event.data, subject, body };

  // Interpolate variables
  let renderedSubject = subject;
  let renderedBody = body;
  for (const [key, value] of Object.entries(event.data)) {
    renderedSubject = renderedSubject.replace(new RegExp(`{{${key}}}`, "g"), String(value));
    renderedBody = renderedBody.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }

  if (userId) {
    await createNotification({
      userId,
      recipientEmail: "",
      subject: renderedSubject,
      body: renderedBody,
      provider: "in_app",
      entityType: event.entityType as any,
      entityId: event.entityId,
      metadata: event.data,
    });
  }
}

// Timeline action
async function executeTimelineAction(config: any, event: AutomationEvent): Promise<void> {
  const { description, status } = config;

  let renderedDescription = description;
  for (const [key, value] of Object.entries(event.data)) {
    renderedDescription = renderedDescription.replace(new RegExp(`{{${key}}}`, "g"), String(value));
  }

  await db.insert(jobTimeline).values({
    jobId: event.entityId,
    status: status || event.data.status || "received",
    description: renderedDescription,
    userId: event.userId,
  });
}

// Status update action
async function executeStatusUpdateAction(config: any, event: AutomationEvent): Promise<void> {
  const { status } = config;
  if (status && event.entityType === "job") {
    await db
      .update(jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(jobs.id, event.entityId));
  }
}

// Log automation execution
async function logAutomationExecution(
  ruleId: string,
  event: AutomationEvent,
  status: "success" | "failed" | "skipped",
  errorMessage?: string
): Promise<void> {
  await db.insert(automationLogs).values({
    ruleId,
    eventType: event.type,
    entityType: event.entityType,
    entityId: event.entityId,
    status,
    errorMessage,
  });
}

// Initialize default automation rules
export async function initializeDefaultRules(): Promise<void> {
  const defaultRules = [
    {
      name: "Job Created Notification",
      description: "Notify admin when new job is created",
      eventType: "job.created",
      conditions: null,
      actions: [
        {
          type: "timeline",
          config: {
            description: "Job was created and received for processing",
            status: "received",
          },
        },
      ],
      isActive: true,
    },
    {
      name: "Job Status Change Timeline",
      description: "Add timeline entry when job status changes",
      eventType: "job.status_changed",
      conditions: null,
      actions: [
        {
          type: "timeline",
          config: {
            description: "Status changed to {{newStatus}}",
            status: "{{newStatus}}",
          },
        },
      ],
      isActive: true,
    },
    {
      name: "Quality Check Failed Alert",
      description: "Notify when quality check fails",
      eventType: "quality.check_failed",
      conditions: null,
      actions: [
        {
          type: "timeline",
          config: {
            description: "Quality check failed: {{defectDescription}}",
            status: "quality_check",
          },
        },
      ],
      isActive: true,
    },
    {
      name: "Dispatch Created",
      description: "Notify when dispatch is created",
      eventType: "dispatch.created",
      conditions: null,
      actions: [
        {
          type: "timeline",
          config: {
            description: "Dispatch {{dispatchNumber}} created for {{quantity}} units",
            status: "dispatched",
          },
        },
      ],
      isActive: true,
    },
    {
      name: "Dispatch Delivered",
      description: "Update job status when delivered",
      eventType: "dispatch.delivered",
      conditions: null,
      actions: [
        {
          type: "timeline",
          config: {
            description: "Order delivered successfully",
            status: "delivered",
          },
        },
        {
          type: "email",
          config: {
            template: "dispatch_delivered",
            recipientType: "customer_contacts",
          },
        },
      ],
      isActive: true,
    },
    {
      name: "Job Overdue Alert",
      description: "Alert when job is overdue",
      eventType: "job.overdue",
      conditions: null,
      actions: [
        {
          type: "email",
          config: {
            template: "job_delay",
            recipientType: "fixed",
            recipients: ["admin@jobtrack.com"],
          },
        },
      ],
      isActive: true,
    },
  ];

  for (const rule of defaultRules) {
    const existing = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.name, rule.name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(automationRules).values(rule);
      console.log(`✅ Default automation rule created: ${rule.name}`);
    }
  }
}

// Helper to emit events
export async function emitEvent(type: AutomationEventType, data: {
  entityType: string;
  entityId: string;
  data: Record<string, any>;
  userId?: string;
}): Promise<void> {
  await processAutomationEvent({
    type,
    entityType: data.entityType,
    entityId: data.entityId,
    data: data.data,
    userId: data.userId,
  });
}
