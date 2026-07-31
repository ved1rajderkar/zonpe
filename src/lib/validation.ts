import { z } from "zod";

// User schemas
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase, one lowercase, and one number"
  ),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  role: z.enum(["admin", "production", "quality", "dispatch", "customer"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase, one lowercase, and one number"
  ),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase, one lowercase, and one number"
  ),
});

// Customer schemas
export const createCustomerSchema = z.object({
  companyName: z.string().min(2, "Company name is required").max(255),
  gstNumber: z.string().max(20).optional(),
  panNumber: z.string().max(12).optional(),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().max(100).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerAddressSchema = z.object({
  label: z.string().max(100).optional(),
  addressLine1: z.string().min(1, "Address line 1 is required").max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  pincode: z.string().min(1, "Pincode is required").max(10),
  country: z.string().max(100).default("India"),
  isPrimary: z.boolean().optional(),
});

export const customerContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  department: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  isPrimary: z.boolean().optional(),
  receiveEmailUpdates: z.boolean().optional(),
  receiveDispatchUpdates: z.boolean().optional(),
  receiveInvoiceUpdates: z.boolean().optional(),
  receiveProductionUpdates: z.boolean().optional(),
  receiveQualityUpdates: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const customerNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

// Job schemas
export const createJobSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  poNumber: z.string().max(100).optional(),
  drawingNumber: z.string().max(100).optional(),
  material: z.string().max(100).optional(),
  grade: z.string().max(50).optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  weight: z.number().positive().optional(),
  unit: z.string().max(20).default("nos"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  estimatedCompletion: z.string().datetime().optional(),
  remarks: z.string().optional(),
});

export const updateJobSchema = z.object({
  customerId: z.string().uuid().optional(),
  poNumber: z.string().max(100).optional(),
  drawingNumber: z.string().max(100).optional(),
  material: z.string().max(100).optional(),
  grade: z.string().max(50).optional(),
  quantity: z.number().int().min(1).optional(),
  weight: z.number().positive().optional(),
  unit: z.string().max(20).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum([
    "received", "po_verified", "drawing_reviewed", "planned", "in_production",
    "quality_check", "rework", "ready_for_dispatch", "dispatched", "delivered",
    "invoiced", "completed", "cancelled"
  ]).optional(),
  dueDate: z.string().datetime().optional(),
  estimatedCompletion: z.string().datetime().optional(),
  remarks: z.string().optional(),
});

export const jobNoteSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

// Production schemas
export const createProductionStepSchema = z.object({
  jobId: z.string().uuid("Invalid job ID"),
  stepName: z.string().min(1, "Step name is required").max(255),
  stepOrder: z.number().int().min(0).optional(),
  estimatedHours: z.number().positive().optional(),
  remarks: z.string().optional(),
});

export const updateProductionStepSchema = z.object({
  stepName: z.string().max(255).optional(),
  stepOrder: z.number().int().min(0).optional(),
  estimatedHours: z.number().positive().optional(),
  actualHours: z.number().positive().optional(),
  remarks: z.string().optional(),
});

export const assignWorkerSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export const startStepSchema = z.object({
  remarks: z.string().optional(),
});

export const completeStepSchema = z.object({
  actualHours: z.number().positive().optional(),
  remarks: z.string().optional(),
});

// Quality schemas
export const createQualityCheckSchema = z.object({
  jobId: z.string().uuid("Invalid job ID"),
  checkType: z.string().min(1, "Check type is required").max(100),
  notes: z.string().optional(),
});

export const updateQualityCheckSchema = z.object({
  checkType: z.string().max(100).optional(),
  status: z.enum(["pending", "passed", "failed", "rework"]).optional(),
  notes: z.string().optional(),
  defectsFound: z.number().int().min(0).optional(),
  defectDescription: z.string().optional(),
});

export const qualityParameterSchema = z.object({
  parameterName: z.string().min(1).max(255),
  expectedValue: z.string().max(100).optional(),
  actualValue: z.string().max(100).optional(),
  unit: z.string().max(30).optional(),
  isPassed: z.boolean().optional(),
});

// Dispatch schemas
export const createDispatchSchema = z.object({
  jobId: z.string().uuid("Invalid job ID"),
  dispatchType: z.enum(["full", "partial"]).default("full"),
  quantityDispatched: z.number().int().min(1, "Quantity must be at least 1"),
  vehicleNumber: z.string().max(30).optional(),
  transporterName: z.string().max(255).optional(),
  lrNumber: z.string().max(100).optional(),
  lrDate: z.string().datetime().optional(),
  ewayBillNumber: z.string().max(100).optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceAmount: z.number().positive().optional(),
});

export const updateDispatchSchema = z.object({
  vehicleNumber: z.string().max(30).optional(),
  transporterName: z.string().max(255).optional(),
  lrNumber: z.string().max(100).optional(),
  lrDate: z.string().datetime().optional(),
  ewayBillNumber: z.string().max(100).optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceAmount: z.number().positive().optional(),
  status: z.enum(["preparing", "in_transit", "delivered", "failed"]).optional(),
});

export const dispatchStatusSchema = z.object({
  status: z.enum(["preparing", "in_transit", "delivered", "failed"]),
  remarks: z.string().optional(),
});

// Notification schemas
export const notificationPreferencesSchema = z.object({
  receiveEmailUpdates: z.boolean().optional(),
  receiveDispatchUpdates: z.boolean().optional(),
  receiveInvoiceUpdates: z.boolean().optional(),
  receiveProductionUpdates: z.boolean().optional(),
  receiveQualityUpdates: z.boolean().optional(),
});

// Settings schemas
export const updateSettingSchema = z.object({
  value: z.any(),
  description: z.string().optional(),
});

// Automation schemas
export const createAutomationRuleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  eventType: z.string().min(1, "Event type is required").max(100),
  conditions: z.any().optional(),
  actions: z.array(z.object({
    type: z.enum(["email", "notification", "timeline", "update_status"]),
    config: z.any(),
  })).min(1, "At least one action is required"),
  isActive: z.boolean().optional(),
});

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();

// Template schemas
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  subjectTemplate: z.string().min(1).max(255),
  bodyTemplate: z.string().min(1),
  eventType: z.string().min(1).max(100),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

// Report schemas
export const reportFilterSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  format: z.enum(["pdf", "excel", "csv"]).default("pdf"),
});

// Search schema
export const searchSchema = z.object({
  q: z.string().min(1, "Search query is required"),
  type: z.enum(["all", "jobs", "customers", "dispatches"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ID param
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID"),
});

// Driver schemas
export const createDriverSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(255),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits").max(20),
  driverId: z.string().min(3, "Driver ID must be at least 3 characters").max(50),
  vehicleNumber: z.string().min(3, "Vehicle number must be at least 3 characters").max(50),
  pin: z.string().min(4, "PIN must be at least 4 digits").max(8),
});

export const updateDriverSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  phoneNumber: z.string().min(10).max(20).optional(),
  driverId: z.string().min(3).max(50).optional(),
  vehicleNumber: z.string().min(3).max(50).optional(),
  pin: z.string().min(4).max(8).optional(),
  isActive: z.boolean().optional(),
  assignedJobId: z.string().uuid().nullable().optional(),
});

export const driverLoginSchema = z.object({
  identifier: z.string().min(1, "Driver ID or phone number is required"),
  pin: z.string().min(1, "PIN is required"),
});
