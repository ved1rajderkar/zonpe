import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { db } from "../db";
import { jobs, customers } from "../db/schema";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";

function generateBarcodeBars(value: string): string {
  const chars = value.split("");
  let x = 0;
  let bars = "";
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    const pattern = ((code * 7 + 3) % 15) + 1;
    for (let i = 0; i < 4; i++) {
      const barWidth = ((pattern >> i) & 1) ? 2 : 1;
      const isBar = i % 2 === 0;
      if (isBar) {
        bars += `<rect x="${x}" y="0" width="${barWidth}" height="50" fill="black"/>`;
      }
      x += barWidth;
    }
    x += 1;
  }
  return bars;
}

const barcodeRoutes = new Hono();

barcodeRoutes.use("*", authMiddleware());

// GET /barcode/:jobId - Generate barcode SVG for a job
barcodeRoutes.get("/barcode/:jobId", async (c) => {
  const { jobId } = c.req.param();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const barcodeValue = job.barcode || job.jobNumber;

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
    <rect width="300" height="100" fill="white"/>
    <text x="150" y="20" text-anchor="middle" font-size="14" font-family="monospace" font-weight="bold">${barcodeValue}</text>
    <g transform="translate(20, 30)">
      ${generateBarcodeBars(barcodeValue)}
    </g>
  </svg>`;

  return c.header("Content-Type", "image/svg+xml").body(svgString);
});

// GET /qr/:jobId - Generate QR code SVG for a job
barcodeRoutes.get("/qr/:jobId", async (c) => {
  const { jobId } = c.req.param();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const qrData = JSON.stringify({
    type: "jobtrack",
    jobId: job.id,
    jobNumber: job.jobNumber,
    trackingToken: job.trackingToken,
    material: job.material,
    quantity: job.quantity,
    unit: job.unit,
    status: job.status,
  });

  const qrSvg = await QRCode.toString(qrData, {
    type: "svg",
    width: 256,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });

  return c.header("Content-Type", "image/svg+xml").body(qrSvg);
});

// GET /label/:jobId - Generate printable label HTML
barcodeRoutes.get("/label/:jobId", async (c) => {
  const { jobId } = c.req.param();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, job.customerId))
    .limit(1);

  const qrData = JSON.stringify({
    type: "jobtrack",
    jobId: job.id,
    jobNumber: job.jobNumber,
    trackingToken: job.trackingToken,
  });

  const qrDataUrl = await QRCode.toDataURL(qrData, {
    width: 128,
    margin: 1,
  });

  const barcodeValue = job.barcode || job.jobNumber;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Job Label - ${job.jobNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; }
    .label {
      width: 4in;
      height: 3in;
      border: 2px solid #000;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      text-align: center;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }
    .header h2 { font-size: 14px; color: #333; }
    .header .job-number { font-size: 18px; font-weight: bold; color: #000; }
    .details { font-size: 10px; line-height: 1.4; }
    .details .row { display: flex; justify-content: space-between; }
    .details .label-text { font-weight: bold; }
    .codes {
      display: flex;
      justify-content: space-around;
      align-items: center;
      border-top: 1px solid #ccc;
      padding-top: 5px;
    }
    .qr-code { width: 80px; height: 80px; }
    .barcode-text { font-size: 8px; text-align: center; margin-top: 2px; }
    @media print {
      body { padding: 0; }
      .label { border: 2px solid #000; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      <h2>JobTrack Pro</h2>
      <div class="job-number">${job.jobNumber}</div>
    </div>
    <div class="details">
      <div class="row"><span class="label-text">Customer:</span> <span>${customer?.companyName || "N/A"}</span></div>
      <div class="row"><span class="label-text">Material:</span> <span>${job.material || "N/A"}</span></div>
      <div class="row"><span class="label-text">Quantity:</span> <span>${job.quantity} ${job.unit}</span></div>
      <div class="row"><span class="label-text">Grade:</span> <span>${job.grade || "N/A"}</span></div>
      <div class="row"><span class="label-text">Status:</span> <span>${job.status}</span></div>
      ${job.dueDate ? `<div class="row"><span class="label-text">Due:</span> <span>${new Date(job.dueDate).toLocaleDateString()}</span></div>` : ""}
    </div>
    <div class="codes">
      <div>
        <img class="qr-code" src="${qrDataUrl}" alt="QR Code" />
      </div>
      <div style="text-align: center;">
        <svg id="barcode"></svg>
        <div class="barcode-text">${barcodeValue}</div>
      </div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    JsBarcode("#barcode", "${barcodeValue}", {
      format: "CODE128",
      width: 1.5,
      height: 30,
      displayValue: false,
      margin: 5
    });
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`;

  return c.header("Content-Type", "text/html").body(html);
});

// POST /scan - Scan QR/barcode and return job details
barcodeRoutes.post("/scan", zValidator("json", z.object({
  code: z.string().min(1),
})), async (c) => {
  const { code } = c.req.valid("json");

  // Try to parse as JSON (QR code)
  let jobId: string | null = null;
  let trackingToken: string | null = null;

  try {
    const parsed = JSON.parse(code);
    if (parsed.jobId) jobId = parsed.jobId;
    if (parsed.trackingToken) trackingToken = parsed.trackingToken;
  } catch {
    // Not JSON - treat as barcode value (jobNumber)
  }

  let job;

  if (jobId) {
    const [found] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    job = found;
  } else if (trackingToken) {
    const [found] = await db.select().from(jobs).where(eq(jobs.trackingToken, trackingToken)).limit(1);
    job = found;
  } else {
    // Try matching as job number or barcode
    const [found] = await db.select().from(jobs).where(eq(jobs.jobNumber, code)).limit(1);
    job = found;
  }

  if (!job) {
    return c.json({ error: "Job not found for this code" }, 404);
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, job.customerId))
    .limit(1);

  return c.json({
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      material: job.material,
      grade: job.grade,
      quantity: job.quantity,
      unit: job.unit,
      status: job.status,
      priority: job.priority,
      dueDate: job.dueDate,
      remarks: job.remarks,
      trackingToken: job.trackingToken,
      customer: customer ? {
        id: customer.id,
        companyName: customer.companyName,
      } : null,
    },
  });
});

export { barcodeRoutes };
