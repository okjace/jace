import { NextResponse } from "next/server";
import { apiError, authorizeScores } from "@/lib/integration";
import { getLeaderboard } from "@/lib/store";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Best score per player in ?game=, with current usernames and avatars and
 * no banned accounts. order=asc for games where lower is better; limit
 * defaults to 50, at most 100.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const caller = await authorizeScores(request);
  if (caller instanceof NextResponse) return caller;

  const params = new URL(request.url).searchParams;
  const game = params.get("game");
  if (!game) return apiError("invalid_request", "game is required.", 400);
  const order = params.get("order") === "asc" ? "asc" : "desc";
  const requested = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isNaN(requested) ? DEFAULT_LIMIT : Math.min(Math.max(requested, 1), MAX_LIMIT);

  const rows = await getLeaderboard(game, order, limit);
  return NextResponse.json({
    scores: rows.map((r) => ({
      user_id: r.userId,
      username: r.username,
      picture: r.picture,
      score: r.score,
      created_at: r.createdAt,
    })),
  });
}
