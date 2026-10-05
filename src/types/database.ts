import type { drizzle } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;
