"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScoreRecord } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

const GRID = 20;
const CELL = 20;
const TICK_MS = 120;

type Point = { x: number; y: number };

function randomFood(snake: Point[]): Point {
  while (true) {
    const p = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

export function SnakeGame({ initialScores }: { initialScores: ScoreRecord[] }) {
  const { status } = useSession();
  const isSignedIn = status === "authenticated";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scores, setScores] = useState(initialScores);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);

  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Point>({ x: 1, y: 0 });
  const nextDirRef = useRef<Point>({ x: 1, y: 0 });
  const foodRef = useRef<Point>({ x: 15, y: 10 });

  const reset = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = { x: 1, y: 0 };
    nextDirRef.current = { x: 1, y: 0 };
    foodRef.current = randomFood(snakeRef.current);
    setScore(0);
    setGameOver(false);
    setSaved(false);
    setRunning(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = dirRef.current;
      const map: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const next = map[e.key];
      if (!next) return;
      e.preventDefault();
      // Prevent reversing directly into the snake's own body.
      if (next.x === -d.x && next.y === -d.y) return;
      nextDirRef.current = next;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const interval = setInterval(() => {
      dirRef.current = nextDirRef.current;
      const snake = snakeRef.current;
      const head = {
        x: snake[0].x + dirRef.current.x,
        y: snake[0].y + dirRef.current.y,
      };

      const hitWall =
        head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
      const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);

      if (hitWall || hitSelf) {
        setRunning(false);
        setGameOver(true);
        return;
      }

      const newSnake = [head, ...snake];
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        setScore((s) => s + 1);
        foodRef.current = randomFood(newSnake);
      } else {
        newSnake.pop();
      }
      snakeRef.current = newSnake;

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(foodRef.current.x * CELL, foodRef.current.y * CELL, CELL - 1, CELL - 1);
      ctx.fillStyle = "#4ade80";
      newSnake.forEach((seg) => {
        ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL - 1, CELL - 1);
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!gameOver || saved || !isSignedIn || score === 0) return;
    setSaved(true);
    fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "snake", score }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(() => fetch("/api/scores?game=snake").then((r) => r.json()))
      .then((data) => data && setScores(data.scores))
      .catch(() => {});
  }, [gameOver, saved, isSignedIn, score]);

  const topScores = [...scores].sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Score: <span className="font-semibold text-foreground">{score}</span>
        </p>
        <canvas
          ref={canvasRef}
          width={GRID * CELL}
          height={GRID * CELL}
          className="rounded-md border border-line"
        />
        {!running && (
          <div className="flex flex-col items-center gap-2">
            {gameOver && <p className="text-sm">Game over!</p>}
            {gameOver && !isSignedIn && score > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sign in to save your score.
              </p>
            )}
            <button
              onClick={reset}
              className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              {gameOver ? "Play again" : "Start"}
            </button>
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Use arrow keys or WASD to move.
        </p>
      </div>

      <div className="w-full max-w-xs">
        <h2 className="mb-2 text-sm font-semibold">Leaderboard</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {topScores.length === 0 && (
            <li className="text-zinc-500 dark:text-zinc-400">No scores yet.</li>
          )}
          {topScores.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="w-4 text-zinc-500 dark:text-zinc-400">{i + 1}.</span>
              <Avatar name={s.userName} imageUrl={s.userImageUrl} size={20} />
              <span className="flex-1 truncate">{s.userName}</span>
              <span className="font-medium">{s.score}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
