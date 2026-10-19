import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { addScore, listScores } from "@/lib/store";
import type { GameId } from "@/lib/types";

const GAMES: GameId[] = ["snake", "memory"];

export async function GET(request: Request): Promise<NextResponse> {
  const game = new URL(request.url).searchParams.get("game") ?? undefined;
  const scores = await listScores(game);
  return NextResponse.json({ scores });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { game, score } = (await request.json()) as {
    game: GameId;
    score: number;
  };

  if (!GAMES.includes(game) || typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json({ error: "Invalid score submission" }, { status: 400 });
  }

  const record = {
    id: randomUUID(),
    game,
    userId: session.user.id,
    userName: session.user.name ?? "Anonymous",
    score: Math.round(score),
    createdAt: new Date().toISOString(),
  };

  await addScore(record);

  return NextResponse.json({ score: record }, { status: 201 });
}
