import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import ws from "ws";
import * as schema from "./schema";

/** Works for both the neon-serverless and pglite drivers (and their transactions). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    instance = drizzle(pool, { schema }) as unknown as Db;
  }
  return instance;
}
