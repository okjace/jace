"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import type { ScoreRecord } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

const SYMBOLS = ["🐱", "🐶", "🦊", "🐼", "🐸", "🐵", "🦁", "🐯"];

type Card = { id: number; symbol: string; flipped: boolean; matched: boolean };

function shuffledDeck(): Card[] {
  const deck = [...SYMBOLS, ...SYMBOLS]
    .map((symbol, i) => ({ id: i, symbol, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5);
  return deck;
}

export function MemoryGame({ initialScores }: { initialScores: ScoreRecord[] }) {
  const { status } = useSession();
  const isSignedIn = status === "authenticated";
  const [cards, setCards] = useState<Card[]>(() => shuffledDeck());
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [scores, setScores] = useState(initialScores);
  const [saved, setSaved] = useState(false);

  const won = useMemo(() => cards.every((c) => c.matched), [cards]);

  useEffect(() => {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    setMoves((m) => m + 1);
    const timeout = setTimeout(() => {
      setCards((prev) => {
        const cardA = prev[a];
        const cardB = prev[b];
        const isMatch = cardA.symbol === cardB.symbol;
        return prev.map((c, i) => {
          if (i !== a && i !== b) return c;
          return { ...c, flipped: isMatch, matched: isMatch };
        });
      });
      setSelected([]);
    }, 700);
    return () => clearTimeout(timeout);
  }, [selected]);

  useEffect(() => {
    if (!won || saved || !isSignedIn) return;
    setSaved(true);
    fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "memory", score: moves }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(() => fetch("/api/scores?game=memory").then((r) => r.json()))
      .then((data) => data && setScores(data.scores))
      .catch(() => {});
  }, [won, saved, isSignedIn, moves]);

  function handleFlip(index: number) {
    if (selected.length === 2) return;
    if (cards[index].flipped || cards[index].matched) return;
    setCards((prev) =>
      prev.map((c, i) => (i === index ? { ...c, flipped: true } : c)),
    );
    setSelected((prev) => [...prev, index]);
  }

  function restart() {
    setCards(shuffledDeck());
    setSelected([]);
    setMoves(0);
    setSaved(false);
  }

  const topScores = [...scores].sort((a, b) => a.score - b.score).slice(0, 10);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Moves: <span className="font-semibold text-foreground">{moves}</span>
        </p>
        <div className="grid grid-cols-4 gap-2">
          {cards.map((card, i) => (
            <button
              key={card.id}
              onClick={() => handleFlip(i)}
              className="flex h-16 w-16 items-center justify-center rounded-md border border-line text-2xl transition-colors"
              style={{
                background:
                  card.flipped || card.matched
                    ? "var(--background)"
                    : "var(--foreground)",
              }}
            >
              {card.flipped || card.matched ? card.symbol : ""}
            </button>
          ))}
        </div>
        {won && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm">Solved in {moves} moves!</p>
            {!isSignedIn && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sign in to save your score.
              </p>
            )}
            <button
              onClick={restart}
              className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              Play again
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-xs">
        <h2 className="mb-2 text-sm font-semibold">Leaderboard (fewest moves)</h2>
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
