/**
 * Instructor-set knobs that apply to the whole lab rather than one sandbox.
 * Today that is the exercise difficulty level: the level the queues hand out
 * and the one an extraction is assumed to have been read from.
 *
 * Settings are global, so this module talks to the raw client rather than a
 * TenantDb; writes are gated on a staff principal by the route that calls them.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { isLevel, type Level } from "./documents/levels";

export const DEFAULT_LEVEL_KEY = "defaultLevel";

/** Cached briefly: every queue read asks for it, and it changes rarely. */
let cache: { level: Level; at: number } | null = null;
const TTL_MS = 10_000;

export async function defaultLevel(): Promise<Level> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.level;
  const [row] = await db.select().from(schema.labSettings).where(eq(schema.labSettings.key, DEFAULT_LEVEL_KEY));
  const raw = Number((row?.value as { level?: number } | undefined)?.level ?? 1);
  const level = isLevel(raw) ? raw : 1;
  cache = { level, at: Date.now() };
  return level;
}

export async function setDefaultLevel(level: Level, updatedBy: string): Promise<void> {
  await db
    .insert(schema.labSettings)
    .values({ key: DEFAULT_LEVEL_KEY, value: { level }, updatedBy })
    .onConflictDoUpdate({ target: schema.labSettings.key, set: { value: { level }, updatedBy, updatedAt: new Date() } });
  cache = { level, at: Date.now() };
}

/** Forget the cached value, for tests and for the write path in the same process. */
export function clearLabSettingsCache(): void {
  cache = null;
}
