/**
 * Turning board rows into something publishable: a name, not a user id, and
 * only the name its owner chose to be known by.
 */
import { inArray } from "drizzle-orm";
import { publicName } from "@/lib/identity/accounts";
import type { BoardRow } from "./runs";

export interface BoardEntry {
  rank: number;
  name: string;
  location: string | null;
  score: number;
  durationMs: number;
  channel: string | null;
  level: number;
  completedAt: string;
  certificate: string | null;
}

export async function boardWithNames(rows: BoardRow[]): Promise<BoardEntry[]> {
  if (rows.length === 0) return [];
  const { db, schema } = await import("@/db/client");
  const ids = [...new Set(rows.map((r) => r.userId))];
  const accounts = await db.select().from(schema.accounts).where(inArray(schema.accounts.userId, ids));
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  const runs = await db.select().from(schema.challengeRuns).where(inArray(schema.challengeRuns.id, rows.map((r) => r.runId)));
  return rows.map((r, i) => {
    const account = accounts.find((a) => a.userId === r.userId);
    const user = users.find((u) => u.id === r.userId);
    return {
      rank: i + 1,
      name: account ? publicName(account) : (user?.displayName ?? "A participant"),
      location: account?.location ?? null,
      score: r.score,
      durationMs: r.durationMs,
      channel: r.channel,
      level: r.level,
      completedAt: r.completedAt.toISOString(),
      certificate: runs.find((x) => x.id === r.runId)?.certificateCode ?? null,
    };
  });
}
