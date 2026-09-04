/**
 * Raw database client. Only these modules may import it:
 *   - src/db/tenant.ts        (the scoped wrapper everything else uses)
 *   - src/lib/sandbox/*       (tenant lifecycle: creation, reset)
 *   - src/lib/jobs/*          (queue + worker)
 *   - src/lib/identity/*      (user mirror)
 *   - scripts/*
 * A test (src/db/scoping.test.ts) enforces that no page or route imports it.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const DEFAULT_URL = "postgres://automationlab:automationlab@127.0.0.1:5432/automationlab";

declare global {
  var __automationLabPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool: Pool = globalThis.__automationLabPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__automationLabPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
