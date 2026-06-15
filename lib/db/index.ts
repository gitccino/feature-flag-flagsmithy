import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// neon-http: one-shot HTTP per query. Fast for reads + simple writes, but no
// interactive transactions (no session to hold a tx open).
export const db = drizzle(process.env.DATABASE_URL!, { schema });

// neon-serverless: WebSocket-backed pool. Needed for dbPool.transaction(...)
// where multiple statements must commit/rollback atomically.
// ws supplies the WebSocket impl in the Node runtime.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export const dbPool = drizzlePool(pool, { schema });
