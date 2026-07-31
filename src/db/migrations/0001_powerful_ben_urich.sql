CREATE TABLE IF NOT EXISTS "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"driver_id" varchar(50) NOT NULL,
	"vehicle_number" varchar(50) NOT NULL,
	"pin_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"assigned_job_id" uuid,
	"tracking_token" varchar(64),
	"last_seen" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_phone_number_unique" UNIQUE("phone_number"),
	CONSTRAINT "drivers_driver_id_unique" UNIQUE("driver_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_job_id_jobs_id_fk" FOREIGN KEY ("assigned_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_driver_id_idx" ON "drivers" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_phone_idx" ON "drivers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drivers_tracking_token_idx" ON "drivers" USING btree ("tracking_token");