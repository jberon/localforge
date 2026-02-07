import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "@shared/schema";
import { logger } from "./lib/logger";

const { Pool } = pkg;

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false,
  });
  
  pool.on('error', (err) => {
    logger.error("[db] Pool connection error", { message: err.message });
  });
  
  pool.on('connect', () => {
    logger.debug("[db] New pool connection established");
  });
  
  db = drizzle(pool, { schema });
}

export { db };
