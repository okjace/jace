import { NextResponse } from "next/server";
import { apiError, authorizeScores, parseScoreSubmission } from "@/lib/integration";
import { importScores, listScoresForUser } from "@/lib/store";

/**
 * The token owner's own scores, newest first (?game= for one game),
 * including the Snake and Memory Match scores from the old Jace site.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeScores(request);
  if (caller instanceof NextResponse) return caller;
  const game = new URL(request.url).searchParams.get("game") || undefined;
  const scores = await listScoresForUser(caller.user.id, game);
  return NextResponse.json({
    scores: scores.map((s) => ({ id: s.id, game: s.game, score: s.score, created_at: s.createdAt })),
  });
}

/** Saves one score or a batch for the token owner. Official apps only. */
export async function POST(request: Request): Promise<NextResponse> {
  const caller = await authorizeScores(request);
  if (caller instanceof NextResponse) return caller;
  if (!caller.official) {
    return apiError("insufficient_scope", "Only Jace's own apps can save scores.", 403);
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("invalid_request", "Send a JSON object.", 400);
  }
  const items = parseScoreSubmission(body);
  if ("error" in items) return apiError("invalid_request", items.error, 400);
  const imported = await importScores(caller.user, caller.client.id, items);
  return NextResponse.json({ imported, skipped: items.length - imported });
}
