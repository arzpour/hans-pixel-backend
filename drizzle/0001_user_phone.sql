ALTER TABLE "users" ADD COLUMN "name_key" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;
--> statement-breakpoint
UPDATE "users"
SET "name_key" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'))
WHERE "name" IS NOT NULL AND btrim("name") <> '';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_name_key_unique" UNIQUE("name_key");
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_unique" UNIQUE("phone");
