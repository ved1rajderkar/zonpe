import { db } from "./index";
import { users, customers, customerContacts, customerAddresses, jobs } from "./schema";
import { hashPassword } from "../lib/auth";
import { nanoid } from "nanoid";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create admin user
    const adminPassword = await hashPassword("Admin@123");
    const [admin] = await db
      .insert(users)
      .values({
        email: "admin@jobtrack.com",
        passwordHash: adminPassword,
        name: "System Admin",
        role: "admin",
        isActive: true,
      })
      .returning();
    console.log("✅ Admin user created:", admin.email);

    // Create production user
    const prodPassword = await hashPassword("Prod@123");
    const [productionUser] = await db
      .insert(users)
      .values({
        email: "production@jobtrack.com",
        passwordHash: prodPassword,
        name: "Production Head",
        role: "production",
        isActive: true,
      })
      .returning();
    console.log("✅ Production user created:", productionUser.email);

    // Create quality user
    const qualPassword = await hashPassword("Quality@123");
    const [qualityUser] = await db
      .insert(users)
      .values({
        email: "quality@jobtrack.com",
        passwordHash: qualPassword,
        name: "Quality Inspector",
        role: "quality",
        isActive: true,
      })
      .returning();
    console.log("✅ Quality user created:", qualityUser.email);

    // Create dispatch user
    const dispatchPassword = await hashPassword("Dispatch@123");
    const [dispatchUser] = await db
      .insert(users)
      .values({
        email: "dispatch@jobtrack.com",
        passwordHash: dispatchPassword,
        name: "Dispatch Manager",
        role: "dispatch",
        isActive: true,
      })
      .returning();
    console.log("✅ Dispatch user created:", dispatchUser.email);

    // Create sample customers
    const customerData = [
      {
        companyName: "Tata Steel Industries",
        gstNumber: "27AABCU9603R1ZM",
        panNumber: "AABCU9603R",
        website: "https://www.tatasteel.com",
        industry: "Automotive",
        notes: "Major client, priority handling required",
        isActive: true,
      },
      {
        companyName: "Reliance Engineering Works",
        gstNumber: "27AABCR1234A1Z5",
        panNumber: "AABCR1234A",
        website: "https://www.reliance.com",
        industry: "Oil & Gas",
        notes: "Regular orders, good payment history",
        isActive: true,
      },
      {
        companyName: "Larsen & Toubro Fabrication",
        gstNumber: "27AAACL1234M1Z8",
        panNumber: "AAACL1234M",
        website: "https://www.larsentoubro.com",
        industry: "Infrastructure",
        notes: "Large volume orders, strict quality requirements",
        isActive: true,
      },
      {
        companyName: "Mahindra Auto Components",
        gstNumber: "27AABCM5678B1Z2",
        panNumber: "AABCM5678B",
        website: "https://www.mahindra.com",
        industry: "Automotive",
        notes: "Just-in-time delivery required",
        isActive: true,
      },
      {
        companyName: "Godrej Precision Engineering",
        gstNumber: "27AABCG9012C1Z0",
        panNumber: "AABCG9012C",
        website: "https://www.godrej.com",
        industry: "Aerospace",
        notes: "High precision components, strict tolerances",
        isActive: true,
      },
    ];

    const insertedCustomers = [];
    for (const customer of customerData) {
      const [inserted] = await db.insert(customers).values(customer).returning();
      insertedCustomers.push(inserted);
      console.log("✅ Customer created:", inserted.companyName);
    }

    // Add contacts for each customer
    for (const customer of insertedCustomers) {
      await db.insert(customerContacts).values({
        customerId: customer.id,
        name: "Primary Contact",
        department: "Procurement",
        email: `procurement@${customer.companyName.toLowerCase().replace(/\s+/g, "")}.com`,
        phone: "+91-9876543210",
        isPrimary: true,
        receiveEmailUpdates: true,
        receiveDispatchUpdates: true,
        receiveInvoiceUpdates: true,
        receiveProductionUpdates: false,
        receiveQualityUpdates: false,
        isActive: true,
      });

      // Add address
      await db.insert(customerAddresses).values({
        customerId: customer.id,
        label: "Head Office",
        addressLine1: "Industrial Area, Phase - II",
        addressLine2: "Near MIDC",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411018",
        country: "India",
        isPrimary: true,
      });
    }
    console.log("✅ Customer contacts and addresses created");

    // Create sample jobs
    const materials = ["MS Plate", "SS 304", "SS 316", "Aluminum 6061", "Copper C110", "Brass C260"];
    const grades = ["A1", "A2", "B1", "B2", "C1"];
    const priorities: Array<"low" | "medium" | "high" | "urgent"> = ["low", "medium", "high", "urgent"];
    const statuses: Array<"received" | "planned" | "in_production" | "quality_check" | "ready_for_dispatch" | "dispatched" | "completed"> = [
      "received", "planned", "in_production", "quality_check", "ready_for_dispatch", "dispatched", "completed"
    ];

    for (let i = 0; i < 15; i++) {
      const customer = insertedCustomers[i % insertedCustomers.length];
      const priority = priorities[i % priorities.length];
      const status = statuses[i % statuses.length];
      const material = materials[i % materials.length];
      const grade = grades[i % grades.length];
      const quantity = Math.floor(Math.random() * 500) + 10;
      const weight = Math.round((Math.random() * 100 + 5) * 100) / 100;
      const year = new Date().getFullYear();
      const jobNumber = `JOB-${year}-${String(i + 1).padStart(5, "0")}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 30) + 7);

      const [job] = await db
        .insert(jobs)
        .values({
          jobNumber,
          customerId: customer.id,
          poNumber: `PO-${year}-${String(1000 + i).padStart(4, "0")}`,
          drawingNumber: `DWG-${String(2000 + i).padStart(4, "0")}`,
          material,
          grade,
          quantity,
          weight,
          unit: "nos",
          priority,
          status,
          dueDate,
          remarks: `Sample job #${i + 1} for ${customer.companyName}`,
          trackingToken: nanoid(32),
          createdBy: admin.id,
        })
        .returning();
      console.log("✅ Job created:", job.jobNumber);
    }

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Login Credentials:");
    console.log("  Admin:      admin@jobtrack.com / Admin@123");
    console.log("  Production: production@jobtrack.com / Prod@123");
    console.log("  Quality:    quality@jobtrack.com / Quality@123");
    console.log("  Dispatch:   dispatch@jobtrack.com / Dispatch@123");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
