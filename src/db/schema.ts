import {
  pgTable, text, varchar, integer, bigint, boolean, timestamp, jsonb,
  real, uniqueIndex, index, pgEnum, uuid, primaryKey
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "production", "quality", "dispatch", "customer"]);
export const jobPriorityEnum = pgEnum("job_priority", ["low", "medium", "high", "urgent"]);
export const jobStatusEnum = pgEnum("job_status", [
  "received", "po_verified", "drawing_reviewed", "planned", "in_production",
  "quality_check", "rework", "ready_for_dispatch", "dispatched", "delivered", "invoiced", "completed", "cancelled"
]);
export const stepStatusEnum = pgEnum("step_status", ["pending", "in_progress", "completed", "skipped"]);
export const qualityCheckStatusEnum = pgEnum("quality_check_status", ["pending", "passed", "failed", "rework"]);
export const dispatchStatusEnum = pgEnum("dispatch_status", ["preparing", "in_transit", "delivered", "failed"]);
export const dispatchTypeEnum = pgEnum("dispatch_type", ["full", "partial"]);
export const documentCategoryEnum = pgEnum("document_category", [
  "drawing", "invoice", "inspection", "dispatch", "image", "po", "challan", "other"
]);
export const entityTypeEnum = pgEnum("entity_type", ["job", "customer", "dispatch"]);
export const notificationProviderEnum = pgEnum("notification_provider", ["email", "sms", "in_app"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "opened", "failed"]);
export const emailStatusEnum = pgEnum("email_status", ["pending", "sending", "sent", "failed"]);
export const automationStatusEnum = pgEnum("automation_status", ["success", "failed", "skipped"]);

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("production"),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_email_idx").on(t.email),
  index("users_role_idx").on(t.role),
]);

// Customers
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  gstNumber: varchar("gst_number", { length: 20 }),
  panNumber: varchar("pan_number", { length: 12 }),
  website: varchar("website", { length: 255 }),
  industry: varchar("industry", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("customers_company_idx").on(t.companyName),
]);

// Customer Addresses
export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }),
  addressLine1: varchar("address_line1", { length: 255 }).notNull(),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  pincode: varchar("pincode", { length: 10 }).notNull(),
  country: varchar("country", { length: 100 }).notNull().default("India"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("customer_addresses_customer_idx").on(t.customerId),
]);

// Customer Contacts
export const customerContacts = pgTable("customer_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  department: varchar("department", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  receiveEmailUpdates: boolean("receive_email_updates").notNull().default(true),
  receiveDispatchUpdates: boolean("receive_dispatch_updates").notNull().default(true),
  receiveInvoiceUpdates: boolean("receive_invoice_updates").notNull().default(true),
  receiveProductionUpdates: boolean("receive_production_updates").notNull().default(false),
  receiveQualityUpdates: boolean("receive_quality_updates").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("customer_contacts_customer_idx").on(t.customerId),
]);

// Customer Notes
export const customerNotes = pgTable("customer_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("customer_notes_customer_idx").on(t.customerId),
]);

// Jobs
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobNumber: varchar("job_number", { length: 30 }).notNull().unique(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  poNumber: varchar("po_number", { length: 100 }),
  drawingNumber: varchar("drawing_number", { length: 100 }),
  material: varchar("material", { length: 100 }),
  grade: varchar("grade", { length: 50 }),
  quantity: integer("quantity").notNull().default(1),
  weight: real("weight"),
  unit: varchar("unit", { length: 20 }).notNull().default("nos"),
  priority: jobPriorityEnum("priority").notNull().default("medium"),
  status: jobStatusEnum("status").notNull().default("received"),
  dueDate: timestamp("due_date"),
  estimatedCompletion: timestamp("estimated_completion"),
  remarks: text("remarks"),
  qrCode: text("qr_code"),
  barcode: varchar("barcode", { length: 100 }),
  trackingToken: varchar("tracking_token", { length: 64 }).notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("jobs_customer_idx").on(t.customerId),
  index("jobs_status_idx").on(t.status),
  index("jobs_job_number_idx").on(t.jobNumber),
  index("jobs_tracking_token_idx").on(t.trackingToken),
  index("jobs_due_date_idx").on(t.dueDate),
]);

// Job Files
export const jobFiles = pgTable("job_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 50 }),
  fileSize: bigint("file_size", { mode: "number" }),
  category: documentCategoryEnum("category").notNull().default("other"),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("job_files_job_idx").on(t.jobId),
]);

// Job Timeline
export const jobTimeline = pgTable("job_timeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  status: jobStatusEnum("status").notNull(),
  description: text("description").notNull(),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("job_timeline_job_idx").on(t.jobId),
]);

// Job Notes
export const jobNotes = pgTable("job_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("job_notes_job_idx").on(t.jobId),
]);

// Production Steps
export const productionSteps = pgTable("production_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  stepName: varchar("step_name", { length: 255 }).notNull(),
  stepOrder: integer("step_order").notNull().default(0),
  status: stepStatusEnum("status").notNull().default("pending"),
  startedBy: uuid("started_by").references(() => users.id),
  completedBy: uuid("completed_by").references(() => users.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedHours: real("estimated_hours"),
  actualHours: real("actual_hours"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("production_steps_job_idx").on(t.jobId),
]);

// Production Assignments
export const productionAssignments = pgTable("production_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  productionStepId: uuid("production_step_id").notNull().references(() => productionSteps.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Quality Checks
export const qualityChecks = pgTable("quality_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  checkType: varchar("check_type", { length: 100 }).notNull(),
  status: qualityCheckStatusEnum("status").notNull().default("pending"),
  inspectorId: uuid("inspector_id").references(() => users.id),
  checkedAt: timestamp("checked_at"),
  notes: text("notes"),
  defectsFound: integer("defects_found").default(0),
  defectDescription: text("defect_description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("quality_checks_job_idx").on(t.jobId),
]);

// Quality Parameters
export const qualityParameters = pgTable("quality_parameters", {
  id: uuid("id").primaryKey().defaultRandom(),
  qualityCheckId: uuid("quality_check_id").notNull().references(() => qualityChecks.id, { onDelete: "cascade" }),
  parameterName: varchar("parameter_name", { length: 255 }).notNull(),
  expectedValue: varchar("expected_value", { length: 100 }),
  actualValue: varchar("actual_value", { length: 100 }),
  unit: varchar("unit", { length: 30 }),
  isPassed: boolean("is_passed"),
});

// Dispatches
export const dispatches = pgTable("dispatches", {
  id: uuid("id").primaryKey().defaultRandom(),
  dispatchNumber: varchar("dispatch_number", { length: 30 }).notNull().unique(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  dispatchType: dispatchTypeEnum("dispatch_type").notNull().default("full"),
  quantityDispatched: integer("quantity_dispatched").notNull(),
  vehicleNumber: varchar("vehicle_number", { length: 30 }),
  transporterName: varchar("transporter_name", { length: 255 }),
  lrNumber: varchar("lr_number", { length: 100 }),
  lrDate: timestamp("lr_date"),
  ewayBillNumber: varchar("eway_bill_number", { length: 100 }),
  driverName: varchar("driver_name", { length: 100 }),
  driverPhone: varchar("driver_phone", { length: 20 }),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  invoiceAmount: real("invoice_amount"),
  status: dispatchStatusEnum("status").notNull().default("preparing"),
  dispatchedAt: timestamp("dispatched_at"),
  deliveredAt: timestamp("delivered_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("dispatches_job_idx").on(t.jobId),
  index("dispatches_status_idx").on(t.status),
]);

// Dispatch Photos
export const dispatchPhotos = pgTable("dispatch_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  dispatchId: uuid("dispatch_id").notNull().references(() => dispatches.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(),
  caption: varchar("caption", { length: 255 }),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Documents
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 50 }),
  fileSize: bigint("file_size", { mode: "number" }),
  category: varchar("category", { length: 50 }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("documents_entity_idx").on(t.entityType, t.entityId),
]);

// Notifications
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  provider: notificationProviderEnum("provider").notNull().default("in_app"),
  status: notificationStatusEnum("status").notNull().default("pending"),
  category: varchar("category", { length: 50 }),
  entityType: entityTypeEnum("entity_type"),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("notifications_user_idx").on(t.userId),
  index("notifications_status_idx").on(t.status),
]);

// Notification Templates
export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  subjectTemplate: varchar("subject_template", { length: 255 }).notNull(),
  bodyTemplate: text("body_template").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Automation Rules
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  conditions: jsonb("conditions"),
  actions: jsonb("actions").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Automation Logs
export const automationLogs = pgTable("automation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").references(() => automationRules.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  status: automationStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

// Email Queue
export const emailQueue = pgTable("email_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  toAddresses: jsonb("to_addresses").notNull(),
  ccAddresses: jsonb("cc_addresses"),
  bccAddresses: jsonb("bcc_addresses"),
  subject: varchar("subject", { length: 255 }).notNull(),
  htmlBody: text("html_body").notNull(),
  attachments: jsonb("attachments"),
  status: emailStatusEnum("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email Logs
export const emailLogs = pgTable("email_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: varchar("message_id", { length: 255 }),
  toAddresses: jsonb("to_addresses").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  providerResponse: jsonb("provider_response"),
  sentAt: timestamp("sent_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: uuid("entity_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("audit_logs_user_idx").on(t.userId),
  index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  index("audit_logs_action_idx").on(t.action),
  index("audit_logs_created_idx").on(t.createdAt),
]);

// Settings
export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value"),
  category: varchar("category", { length: 50 }),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Roles
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Users (for portal)
export const customerUsers = pgTable("customer_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Customer Sessions
export const customerSessions = pgTable("customer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerUserId: uuid("customer_user_id").notNull().references(() => customerUsers.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("customer_sessions_token_idx").on(t.token),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  customerNotes: many(customerNotes),
  jobNotes: many(jobNotes),
  jobsCreated: many(jobs),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(customerAddresses),
  contacts: many(customerContacts),
  notes: many(customerNotes),
  jobs: many(jobs),
  customerUsers: many(customerUsers),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, { fields: [customerAddresses.customerId], references: [customers.id] }),
}));

export const customerContactsRelations = relations(customerContacts, ({ one }) => ({
  customer: one(customers, { fields: [customerContacts.customerId], references: [customers.id] }),
}));

export const customerNotesRelations = relations(customerNotes, ({ one }) => ({
  customer: one(customers, { fields: [customerNotes.customerId], references: [customers.id] }),
  user: one(users, { fields: [customerNotes.userId], references: [users.id] }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
  createdByUser: one(users, { fields: [jobs.createdBy], references: [users.id] }),
  files: many(jobFiles),
  timeline: many(jobTimeline),
  notes: many(jobNotes),
  productionSteps: many(productionSteps),
  qualityChecks: many(qualityChecks),
  dispatches: many(dispatches),
}));

export const jobFilesRelations = relations(jobFiles, ({ one }) => ({
  job: one(jobs, { fields: [jobFiles.jobId], references: [jobs.id] }),
}));

export const jobTimelineRelations = relations(jobTimeline, ({ one }) => ({
  job: one(jobs, { fields: [jobTimeline.jobId], references: [jobs.id] }),
  user: one(users, { fields: [jobTimeline.userId], references: [users.id] }),
}));

export const jobNotesRelations = relations(jobNotes, ({ one }) => ({
  job: one(jobs, { fields: [jobNotes.jobId], references: [jobs.id] }),
  user: one(users, { fields: [jobNotes.userId], references: [users.id] }),
}));

export const productionStepsRelations = relations(productionSteps, ({ one, many }) => ({
  job: one(jobs, { fields: [productionSteps.jobId], references: [jobs.id] }),
  assignments: many(productionAssignments),
}));

export const productionAssignmentsRelations = relations(productionAssignments, ({ one }) => ({
  step: one(productionSteps, { fields: [productionAssignments.productionStepId], references: [productionSteps.id] }),
  user: one(users, { fields: [productionAssignments.userId], references: [users.id] }),
}));

export const qualityChecksRelations = relations(qualityChecks, ({ one, many }) => ({
  job: one(jobs, { fields: [qualityChecks.jobId], references: [jobs.id] }),
  parameters: many(qualityParameters),
}));

export const qualityParametersRelations = relations(qualityParameters, ({ one }) => ({
  check: one(qualityChecks, { fields: [qualityParameters.qualityCheckId], references: [qualityChecks.id] }),
}));

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  job: one(jobs, { fields: [dispatches.jobId], references: [jobs.id] }),
  photos: many(dispatchPhotos),
}));

export const dispatchPhotosRelations = relations(dispatchPhotos, ({ one }) => ({
  dispatch: one(dispatches, { fields: [dispatchPhotos.dispatchId], references: [dispatches.id] }),
}));

export const customerUsersRelations = relations(customerUsers, ({ one, many }) => ({
  customer: one(customers, { fields: [customerUsers.customerId], references: [customers.id] }),
  sessions: many(customerSessions),
}));

export const customerSessionsRelations = relations(customerSessions, ({ one }) => ({
  customerUser: one(customerUsers, { fields: [customerSessions.customerUserId], references: [customerUsers.id] }),
}));
