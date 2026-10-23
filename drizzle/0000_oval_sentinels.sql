CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paypal_order_id" text,
	"painting_id" uuid NOT NULL,
	"item" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"item_cents" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"tax_county" text,
	"buyer_name" text,
	"buyer_email" text,
	"ship_to" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	CONSTRAINT "orders_paypal_order_id_unique" UNIQUE("paypal_order_id")
);
--> statement-breakpoint
CREATE TABLE "paintings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"medium" text NOT NULL,
	"size" text NOT NULL,
	"year" integer NOT NULL,
	"description" text NOT NULL,
	"image_url" text NOT NULL,
	"image_large_url" text NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"original_status" text DEFAULT 'for_sale' NOT NULL,
	"original_price_cents" integer,
	"print_enabled" boolean DEFAULT false NOT NULL,
	"print_size" text,
	"print_price_cents" integer,
	"visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"held_until" timestamp with time zone,
	"held_by_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paintings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"artist_name" text DEFAULT 'M Brown' NOT NULL,
	"shipping_cents" integer DEFAULT 1000 NOT NULL,
	"tax_enabled" boolean DEFAULT true NOT NULL,
	"about_text" text DEFAULT '' NOT NULL,
	"about_photo_url" text,
	"contact_email" text DEFAULT '' NOT NULL,
	"instagram_url" text
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_painting_id_paintings_id_fk" FOREIGN KEY ("painting_id") REFERENCES "public"."paintings"("id") ON DELETE no action ON UPDATE no action;