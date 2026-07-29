import { db } from "../db";
import { notifications, notificationTemplates, customerContacts } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { sendTemplateEmail } from "./email";

interface CreateNotificationOptions {
  userId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  provider?: "email" | "sms" | "in_app";
  category?: string;
  entityType?: "job" | "customer" | "dispatch";
  entityId?: string;
  metadata?: Record<string, any>;
}

// Create notification
export async function createNotification(options: CreateNotificationOptions): Promise<string> {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: options.userId || null,
      recipientEmail: options.recipientEmail,
      subject: options.subject,
      body: options.body,
      provider: options.provider || "in_app",
      status: options.provider === "email" ? "pending" : "sent",
      category: options.category,
      entityType: options.entityType,
      entityId: options.entityId,
      metadata: options.metadata,
      sentAt: options.provider === "in_app" ? new Date() : null,
    })
    .returning();

  // Send email if provider is email
  if (options.provider === "email") {
    try {
      await sendTemplateEmail(options.category || "notification", options.recipientEmail, {
        subject: options.subject,
        body: options.body,
        ...options.metadata,
      });

      await db
        .update(notifications)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notifications.id, notification.id));
    } catch (error) {
      await db
        .update(notifications)
        .set({ status: "failed" })
        .where(eq(notifications.id, notification.id));
    }
  }

  return notification.id;
}

// Create in-app notification
export async function createInAppNotification(
  userId: string,
  subject: string,
  body: string,
  options?: {
    category?: string;
    entityType?: "job" | "customer" | "dispatch";
    entityId?: string;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  return createNotification({
    userId,
    recipientEmail: "",
    subject,
    body,
    provider: "in_app",
    ...options,
  });
}

// Send email notification to customer contacts
export async function notifyCustomerContacts(
  customerId: string,
  eventType: string,
  variables: Record<string, string>,
  options?: {
    filter?: (contact: any) => boolean;
  }
): Promise<{ sent: number; failed: number }> {
  const contacts = await db
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, customerId),
        eq(customerContacts.isActive, true)
      )
    );

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    // Check if contact should receive this type of notification
    if (!contact.email) continue;
    if (options?.filter && !options.filter(contact)) continue;

    // Check notification preferences based on event type
    const shouldNotify = checkNotificationPreference(contact, eventType);
    if (!shouldNotify) continue;

    try {
      await sendTemplateEmail(eventType, contact.email, {
        ...variables,
        recipientName: contact.name,
      });
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

// Check notification preference
function checkNotificationPreference(contact: any, eventType: string): boolean {
  switch (eventType) {
    case "job_status_update":
    case "job_received":
      return contact.receiveEmailUpdates;
    case "dispatch_created":
    case "dispatch_delivered":
      return contact.receiveDispatchUpdates;
    case "invoice":
      return contact.receiveInvoiceUpdates;
    case "quality_check":
    case "quality_failed":
      return contact.receiveQualityUpdates;
    default:
      return contact.receiveEmailUpdates;
  }
}

// Get user notifications
export async function getUserNotifications(
  userId: string,
  options?: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ notifications: any[]; total: number }> {
  const conditions = [eq(notifications.userId, userId)];
  if (options?.status) {
    conditions.push(eq(notifications.status, options.status as any));
  }
  if (options?.category) {
    conditions.push(eq(notifications.category, options.category));
  }

  const results = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(notifications.createdAt)
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  return { notifications: results, total: results.length };
}

// Mark notification as read
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ status: "opened", openedAt: new Date() })
    .where(eq(notifications.id, notificationId));
  return true;
}

// Mark all user notifications as read
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ status: "opened", openedAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.status, "pending")
      )
    );
  return 0;
}

// Get unread count
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.status, "pending")
      )
    );
  return result.length;
}

// Delete old notifications
export async function cleanupOldNotifications(daysOld: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  // In a real implementation, you'd use a WHERE clause with date comparison
  return 0;
}
