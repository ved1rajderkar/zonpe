import * as XLSX from "xlsx";

// Generate job report Excel
export function generateJobReportExcel(jobs: any[]): Buffer {
  const data = jobs.map((job) => ({
    "Job Number": job.jobNumber,
    Customer: job.customerName || job.customer?.companyName || "-",
    "PO Number": job.poNumber || "-",
    Material: job.material || "-",
    Grade: job.grade || "-",
    Quantity: job.quantity,
    Unit: job.unit,
    Priority: job.priority,
    Status: job.status.replace(/_/g, " "),
    "Due Date": job.dueDate ? new Date(job.dueDate).toLocaleDateString() : "-",
    "Created At": new Date(job.createdAt).toLocaleDateString(),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs Report");

  // Auto-fit columns
  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String((row as any)[key] || "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate customer report Excel
export function generateCustomerReportExcel(customers: any[]): Buffer {
  const data = customers.map((customer) => ({
    "Company Name": customer.companyName,
    "GST Number": customer.gstNumber || "-",
    "PAN Number": customer.panNumber || "-",
    Industry: customer.industry || "-",
    Website: customer.website || "-",
    "Total Jobs": customer.totalJobs || 0,
    "Active Jobs": customer.activeJobs || 0,
    "Contact Name": customer.contactName || "-",
    "Contact Email": customer.contactEmail || "-",
    "Contact Phone": customer.contactPhone || "-",
    City: customer.city || "-",
    State: customer.state || "-",
    Status: customer.isActive ? "Active" : "Inactive",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers Report");

  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String((row as any)[key] || "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate production report Excel
export function generateProductionReportExcel(data: {
  jobs: any[];
  steps: any[];
  summary: {
    totalJobs: number;
    completedJobs: number;
    inProduction: number;
    avgCompletionTime: number;
  };
}): Buffer {
  // Summary sheet
  const summaryData = [
    { Metric: "Total Jobs", Value: data.summary.totalJobs },
    { Metric: "Completed Jobs", Value: data.summary.completedJobs },
    { Metric: "In Production", Value: data.summary.inProduction },
    { Metric: "Avg Completion Time (hours)", Value: data.summary.avgCompletionTime.toFixed(1) },
  ];

  // Jobs sheet
  const jobsData = data.jobs.map((job) => ({
    "Job Number": job.jobNumber,
    Customer: job.customerName || "-",
    Status: job.status.replace(/_/g, " "),
    Priority: job.priority,
    "Due Date": job.dueDate ? new Date(job.dueDate).toLocaleDateString() : "-",
    "Total Steps": job.totalSteps || 0,
    "Completed Steps": job.completedSteps || 0,
    Progress: job.totalSteps ? `${Math.round((job.completedSteps / job.totalSteps) * 100)}%` : "0%",
  }));

  // Steps sheet
  const stepsData = data.steps.map((step) => ({
    "Job Number": step.jobNumber,
    "Step Name": step.stepName,
    Order: step.stepOrder,
    Status: step.status,
    "Started At": step.startedAt ? new Date(step.startedAt).toLocaleString() : "-",
    "Completed At": step.completedAt ? new Date(step.completedAt).toLocaleString() : "-",
    "Estimated Hours": step.estimatedHours || "-",
    "Actual Hours": step.actualHours || "-",
    Assigned: step.assignedUsers || "-",
  }));

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  if (jobsData.length > 0) {
    const jobsSheet = XLSX.utils.json_to_sheet(jobsData);
    XLSX.utils.book_append_sheet(workbook, jobsSheet, "Jobs");
  }

  if (stepsData.length > 0) {
    const stepsSheet = XLSX.utils.json_to_sheet(stepsData);
    XLSX.utils.book_append_sheet(workbook, stepsSheet, "Production Steps");
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate dispatch report Excel
export function generateDispatchReportExcel(dispatches: any[]): Buffer {
  const data = dispatches.map((dispatch) => ({
    "Dispatch Number": dispatch.dispatchNumber,
    "Job Number": dispatch.jobNumber || dispatch.job?.jobNumber || "-",
    Customer: dispatch.customerName || dispatch.job?.customer?.companyName || "-",
    "Dispatch Type": dispatch.dispatchType,
    "Quantity Dispatched": dispatch.quantityDispatched,
    Transporter: dispatch.transporterName || "-",
    "Vehicle Number": dispatch.vehicleNumber || "-",
    "LR Number": dispatch.lrNumber || "-",
    "Invoice Number": dispatch.invoiceNumber || "-",
    "Invoice Amount": dispatch.invoiceAmount ? `₹${dispatch.invoiceAmount.toLocaleString()}` : "-",
    Status: dispatch.status.replace(/_/g, " "),
    "Dispatched At": dispatch.dispatchedAt ? new Date(dispatch.dispatchedAt).toLocaleString() : "-",
    "Delivered At": dispatch.deliveredAt ? new Date(dispatch.deliveredAt).toLocaleString() : "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatch Report");

  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String((row as any)[key] || "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate delay report Excel
export function generateDelayReportExcel(delayedJobs: any[]): Buffer {
  const data = delayedJobs.map((job) => ({
    "Job Number": job.jobNumber,
    Customer: job.customerName || job.customer?.companyName || "-",
    Material: job.material || "-",
    Quantity: job.quantity,
    Status: job.status.replace(/_/g, " "),
    Priority: job.priority,
    "Due Date": job.dueDate ? new Date(job.dueDate).toLocaleDateString() : "-",
    "Days Overdue": job.daysOverdue,
    "Estimated Completion": job.estimatedCompletion
      ? new Date(job.estimatedCompletion).toLocaleDateString()
      : "-",
    Remarks: job.remarks || "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Delay Report");

  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String((row as any)[key] || "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate quality report Excel
export function generateQualityReportExcel(checks: any[]): Buffer {
  const data = checks.map((check) => ({
    "Job Number": check.jobNumber || check.job?.jobNumber || "-",
    "Check Type": check.checkType,
    Status: check.status,
    Inspector: check.inspectorName || check.inspector?.name || "-",
    "Checked At": check.checkedAt ? new Date(check.checkedAt).toLocaleString() : "-",
    "Defects Found": check.defectsFound || 0,
    "Defect Description": check.defectDescription || "-",
    Notes: check.notes || "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Quality Report");

  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, ...data.map((row) => String((row as any)[key] || "").length)) + 2,
  }));
  worksheet["!cols"] = colWidths;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

// Generate CSV from data
export function generateCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        const strValue = String(value);
        if (strValue.includes(",") || strValue.includes('"') || strValue.includes("\n")) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}
