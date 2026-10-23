import {
  boolean, integer, jsonb, pgTable, serial, text, timestamp, uuid,
} from "drizzle-orm/pg-core";

export type ShipTo = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export const paintings = pgTable("paintings", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  medium: text("medium").notNull(),
  size: text("size").notNull(),
  year: integer("year").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  imageLargeUrl: text("image_large_url").notNull(),
  imageWidth: integer("image_width").notNull(),
  imageHeight: integer("image_height").notNull(),
  originalStatus: text("original_status", { enum: ["for_sale", "sold", "not_for_sale"] })
    .notNull().default("for_sale"),
  originalPriceCents: integer("original_price_cents"),
  printEnabled: boolean("print_enabled").notNull().default(false),
  printSize: text("print_size"),
  printPriceCents: integer("print_price_cents"),
  visible: boolean("visible").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  heldUntil: timestamp("held_until", { withTimezone: true }),
  heldByOrderId: uuid("held_by_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  paypalOrderId: text("paypal_order_id").unique(),
  paintingId: uuid("painting_id").notNull().references(() => paintings.id),
  item: text("item", { enum: ["original", "print"] }).notNull(),
  status: text("status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
  itemCents: integer("item_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  taxCounty: text("tax_county"),
  buyerName: text("buyer_name"),
  buyerEmail: text("buyer_email"),
  shipTo: jsonb("ship_to").$type<ShipTo>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  /** Set when the shipped email was sent; null on a shipped order means it still needs sending. */
  shippedEmailSentAt: timestamp("shipped_email_sent_at", { withTimezone: true }),
  /** Set while a capture attempt is in flight; serialises concurrent completeCheckout calls. */
  captureStartedAt: timestamp("capture_started_at", { withTimezone: true }),
  /** Paid order that needs the artist's attention. Policy per value: src/lib/orders/attention.ts. */
  attention: text("attention", { enum: ["sold_twice", "unavailable_paid", "amount_mismatch", "payment_pending"] }),
  /** PayPal environment the order was placed in; sandbox orders are test orders (never shipped or taxed). */
  paypalEnv: text("paypal_env", { enum: ["sandbox", "live"] }).notNull().default("live"),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  artistName: text("artist_name").notNull().default("M Brown"),
  shippingCents: integer("shipping_cents").notNull().default(1000),
  taxEnabled: boolean("tax_enabled").notNull().default(true),
  aboutText: text("about_text").notNull().default(""),
  aboutPhotoUrl: text("about_photo_url"),
  contactEmail: text("contact_email").notNull().default(""),
  instagramUrl: text("instagram_url"),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type Painting = typeof paintings.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Settings = typeof settings.$inferSelect;
