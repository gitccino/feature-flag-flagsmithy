ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_unique";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_slug_unique" UNIQUE("created_by","slug");