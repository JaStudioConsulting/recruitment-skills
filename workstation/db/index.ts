import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export class StorageBindingError extends Error {
  constructor(public readonly binding: "DB" | "BUCKET") {
    super(`Cloudflare ${binding} binding is unavailable.`);
    this.name = "StorageBindingError";
  }
}

export function getDb() {
  if (!env.DB) {
    throw new StorageBindingError("DB");
  }

  return drizzle(env.DB, { schema });
}

export function getSourceBucket(): R2Bucket {
  if (!env.BUCKET) throw new StorageBindingError("BUCKET");
  return env.BUCKET;
}
