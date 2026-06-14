CREATE TYPE "public"."environment_key" AS ENUM('development', 'staging', 'production');--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" "environment_key" NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "environments_project_id_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "flag_environment_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percentage" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "flag_environment_states_flag_id_environment_id_unique" UNIQUE("flag_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "flag_targeting_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_environment_state_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	"served_value" boolean NOT NULL,
	"rollout_percentage" integer,
	CONSTRAINT "flag_targeting_rules_state_id_priority_unique" UNIQUE("flag_environment_state_id","priority"),
	CONSTRAINT "flag_targeting_rules_state_id_segment_id_unique" UNIQUE("flag_environment_state_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flags_project_id_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "segments_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environment_states" ADD CONSTRAINT "flag_environment_states_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_environment_states" ADD CONSTRAINT "flag_environment_states_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_targeting_rules" ADD CONSTRAINT "flag_targeting_rules_flag_environment_state_id_flag_environment_states_id_fk" FOREIGN KEY ("flag_environment_state_id") REFERENCES "public"."flag_environment_states"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_targeting_rules" ADD CONSTRAINT "flag_targeting_rules_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environments_project_id_idx" ON "environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "flag_environment_states_flag_id_idx" ON "flag_environment_states" USING btree ("flag_id");--> statement-breakpoint
CREATE INDEX "flag_environment_states_environment_id_idx" ON "flag_environment_states" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "flag_targeting_rules_flag_environment_state_id_idx" ON "flag_targeting_rules" USING btree ("flag_environment_state_id");--> statement-breakpoint
CREATE INDEX "flag_targeting_rules_segment_id_idx" ON "flag_targeting_rules" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "flags_project_id_idx" ON "flags" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_idx" ON "projects" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "segments_project_id_idx" ON "segments" USING btree ("project_id");