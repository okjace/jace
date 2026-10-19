import Link from "next/link";

const GAMES = [
  {
    href: "/games/snake",
    title: "Snake",
    description: "Classic snake. Eat, grow, don't hit the walls.",
    emoji: "🐍",
  },
  {
    href: "/games/memory",
    title: "Memory Match",
    description: "Flip cards and find every pair in as few moves as possible.",
    emoji: "🧠",
  },
];

export default function GamesPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Games</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GAMES.map((game) => (
          <Link
            key={game.href}
            href={game.href}
            className="flex flex-col gap-2 rounded-lg border border-line p-5 transition-colors hover:bg-foreground/[.05]"
          >
            <span className="text-3xl">{game.emoji}</span>
            <h2 className="text-lg font-semibold">{game.title}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {game.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
