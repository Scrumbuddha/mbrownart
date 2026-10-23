import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "./client";
import * as schema from "./schema";

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  await db.insert(schema.settings).values({ id: 1 });
  return db as unknown as Db;
}
