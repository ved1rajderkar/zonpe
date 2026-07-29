import { Resend } from "resend";
import { env } from "./env";
import { db } from "../db";
import { emailQueue, emailLogs, notificationTemplates } from "../db/schema";
import { eq, and, lte } from "drizzle-orm";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient && env.RESEND_API_KEY) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient!;
}

// Template variable interpolation
function renderTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return rendered;
}

// Email templates
const templates: Record<string, { subject: string; html: string }> = {
  job_received: {
    subject: "New Job Received - {{jobNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a365d; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">New Job Received</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <h2>Job Details</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Material:</td><td>{{material}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Quantity:</td><td>{{quantity}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Due Date:</td><td>{{dueDate}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Priority:</td><td>{{priority}}</td></tr>
    </table>
    <p style="margin-top: 20px;">Track this job: <a href="{{trackingUrl}}">{{trackingUrl}}</a></p>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  job_status_update: {
    subject: "Job Status Update - {{jobNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2b6cb0; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Job Status Update</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <h2>Status Changed</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Previous Status:</td><td>{{previousStatus}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">New Status:</td><td>{{newStatus}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Updated By:</td><td>{{updatedBy}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  quality_check: {
    subject: "Quality Check {{status}} - {{jobNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: {{statusColor}}; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Quality Check {{status}}</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Check Type:</td><td>{{checkType}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td>{{status}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Inspector:</td><td>{{inspector}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Defects Found:</td><td>{{defectsFound}}</td></tr>
      {{#if defectDescription}}
      <tr><td style="padding: 8px; font-weight: bold;">Description:</td><td>{{defectDescription}}</td></tr>
      {{/if}}
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  dispatch_created: {
    subject: "Dispatch Created - {{dispatchNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2f855a; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Dispatch Created</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Dispatch Number:</td><td>{{dispatchNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Quantity:</td><td>{{quantity}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Transporter:</td><td>{{transporter}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Vehicle:</td><td>{{vehicleNumber}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  dispatch_delivered: {
    subject: "Delivery Confirmed - {{dispatchNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #276749; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Delivery Confirmed</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Dispatch Number:</td><td>{{dispatchNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Delivered At:</td><td>{{deliveredAt}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  job_delay: {
    subject: "⚠️ Job Delay Alert - {{jobNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #c53030; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">⚠️ Job Delay Alert</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Due Date:</td><td>{{dueDate}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Days Overdue:</td><td style="color: #c53030; font-weight: bold;">{{daysOverdue}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Current Status:</td><td>{{status}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  job_ready: {
    subject: "Job Ready for Dispatch - {{jobNumber}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2b6cb0; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Job Ready for Dispatch</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{customerName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Quantity:</td><td>{{quantity}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  daily_report: {
    subject: "Daily Production Report - {{date}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a365d; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Daily Production Report</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <h2>Summary for {{date}}</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Total Jobs:</td><td>{{totalJobs}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Completed:</td><td>{{completed}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">In Production:</td><td>{{inProduction}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Delayed:</td><td style="color: #c53030;">{{delayed}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Ready for Dispatch:</td><td>{{readyForDispatch}}</td></tr>
    </table>
  </div>
  <div style="padding: 10px; text-align: center; color: #718096; font-size: 12px;">
    <p>© 2024 JobTrack Pro. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  password_reset: {
    subject: "Password Reset Request",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a365d; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Password Reset Request</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <p>Hi {{name}},</p>
    <p>You requested a password reset. Click the button below to reset your password:</p>
    <div style="text-align: center; margin: 20px;">
      <a href="{{resetUrl}}" style="background: #2b6cb0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a>
    </div>
    <p style="color: #718096; font-size: 12px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
  </div>
</body>
</html>`,
  },
  invoice: {
    subject: "Invoice for {{jobNumber}} - {{companyName}}",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1a365d; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">JobTrack Pro</h1>
    <p style="margin: 5px 0 0;">Invoice</p>
  </div>
  <div style="padding: 20px; background: #f7fafc;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px; font-weight: bold;">Invoice Number:</td><td>{{invoiceNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Job Number:</td><td>{{jobNumber}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td>{{companyName}}</td></tr>
      <tr><td style="padding: 8px; font-weight: bold;">Amount:</td><td style="font-size: 18px; font-weight: bold;">₹{{amount}}</td></tr>
    </table>
    <p style="margin-top: 20px;">Please find the invoice attached.</p>
  </div>
</body>
</html>`,
  },
};

// Send email directly
export async function sendEmail(options: {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string | Buffer }>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resend = getResend();
  if (!resend) {
    console.warn("⚠️ Resend API key not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const to = Array.isArray(options.to) ? options.to : [options.to];
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });

    // Log email
    await db.insert(emailLogs).values({
      messageId: result.data?.id,
      toAddresses: to,
      subject: options.subject,
      status: "sent",
      providerResponse: result.data,
      sentAt: new Date(),
    });

    return { success: true, messageId: result.data?.id };
  } catch (error: any) {
    console.error("❌ Email send failed:", error);

    await db.insert(emailLogs).values({
      toAddresses: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      status: "failed",
      providerResponse: { error: error.message },
      sentAt: new Date(),
    });

    return { success: false, error: error.message };
  }
}

// Send template email
export async function sendTemplateEmail(
  templateName: string,
  to: string | string[],
  variables: Record<string, string>,
  options?: { cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; content: string | Buffer }> }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const template = templates[templateName];
  if (!template) {
    // Try DB template
    const [dbTemplate] = await db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.name, templateName))
      .limit(1);

    if (dbTemplate) {
      return sendEmail({
        to,
        cc: options?.cc,
        bcc: options?.bcc,
        subject: renderTemplate(dbTemplate.subjectTemplate, variables),
        html: renderTemplate(dbTemplate.bodyTemplate, variables),
        attachments: options?.attachments,
      });
    }
    return { success: false, error: `Template '${templateName}' not found` };
  }

  return sendEmail({
    to,
    cc: options?.cc,
    bcc: options?.bcc,
    subject: renderTemplate(template.subject, variables),
    html: renderTemplate(template.html, variables),
    attachments: options?.attachments,
  });
}

// Queue email for later sending
export async function queueEmail(options: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  scheduledAt?: Date;
  attachments?: Array<{ filename: string; content: string | Buffer }>;
}): Promise<string> {
  const [queued] = await db
    .insert(emailQueue)
    .values({
      toAddresses: options.to,
      ccAddresses: options.cc || [],
      bccAddresses: options.bcc || [],
      subject: options.subject,
      htmlBody: options.html,
      attachments: options.attachments || [],
      status: "pending",
      scheduledAt: options.scheduledAt,
    })
    .returning();
  return queued.id;
}

// Process email queue
export async function processEmailQueue(): Promise<void> {
  const pendingEmails = await db
    .select()
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        lte(emailQueue.scheduledAt, new Date())
      )
    )
    .limit(10);

  for (const email of pendingEmails) {
    try {
      await db
        .update(emailQueue)
        .set({ status: "sending" })
        .where(eq(emailQueue.id, email.id));

      const result = await sendEmail({
        to: email.toAddresses as string[],
        cc: email.ccAddresses as string[] | undefined,
        bcc: email.bccAddresses as string[] | undefined,
        subject: email.subject,
        html: email.htmlBody,
        attachments: email.attachments as any[] | undefined,
      });

      if (result.success) {
        await db
          .update(emailQueue)
          .set({
            status: "sent",
            sentAt: new Date(),
          })
          .where(eq(emailQueue.id, email.id));
      } else {
        const newRetryCount = email.retryCount + 1;
        await db
          .update(emailQueue)
          .set({
            status: newRetryCount >= email.maxRetries ? "failed" : "pending",
            retryCount: newRetryCount,
            errorMessage: result.error,
          })
          .where(eq(emailQueue.id, email.id));
      }
    } catch (error: any) {
      const newRetryCount = email.retryCount + 1;
      await db
        .update(emailQueue)
        .set({
          status: newRetryCount >= email.maxRetries ? "failed" : "pending",
          retryCount: newRetryCount,
          errorMessage: error.message,
        })
        .where(eq(emailQueue.id, email.id));
    }
  }
}
